/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

//! The structure that contains the custom properties of a given element.

use crate::custom_properties::Name;
use crate::properties_and_values::value::ComputedValue as ComputedRegisteredValue;
use crate::selector_map::PrecomputedHasher;
use indexmap::IndexMap;
use servo_arc::Arc;
use std::hash::BuildHasherDefault;

/// A map for a set of custom properties, which implements copy-on-write behavior on insertion with
/// cheap copying.
#[derive(Clone, Debug, PartialEq)]
pub struct CustomPropertiesMap(Arc<Inner>);

impl Default for CustomPropertiesMap {
    fn default() -> Self {
        Self(EMPTY.clone())
    }
}

/// We use None in the value to represent a removed entry.
type OwnMap =
    IndexMap<Name, Option<ComputedRegisteredValue>, BuildHasherDefault<PrecomputedHasher>>;

lazy_static! {
    static ref EMPTY: Arc<Inner> = {
        Arc::new_leaked(Inner {
            own_properties: Default::default(),
            parent: None,
            len: 0,
            ancestor_count: 0,
        })
    };
}

#[derive(Debug, Clone)]
struct Inner {
    own_properties: OwnMap,
    parent: Option<Arc<Inner>>,
    /// The number of custom properties we store. Note that this is different from the sum of our
    /// own and our parent's length, since we might store duplicate entries.
    len: usize,
    /// The number of ancestors we have.
    ancestor_count: u8,
}

/// A not-too-large, not too small ancestor limit, to prevent creating too-big chains.
const ANCESTOR_COUNT_LIMIT: usize = 4;

/// An iterator over the custom properties.
pub struct Iter<'a> {
    current: &'a Inner,
    current_iter: indexmap::map::Iter<'a, Name, Option<ComputedRegisteredValue>>,
    descendants: smallvec::SmallVec<[&'a Inner; ANCESTOR_COUNT_LIMIT]>,
}

impl<'a> Iterator for Iter<'a> {
    type Item = (&'a Name, &'a Option<ComputedRegisteredValue>);

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            let (name, value) = match self.current_iter.next() {
                Some(v) => v,
                None => {
                    let parent = self.current.parent.as_deref()?;
                    self.descendants.push(self.current);
                    self.current = parent;
                    self.current_iter = parent.own_properties.iter();
                    continue;
                },
            };
            // If the property is overridden by a descendant we've already visited it.
            for descendant in &self.descendants {
                if descendant.own_properties.contains_key(name) {
                    continue;
                }
            }
            return Some((name, value));
        }
    }
}

impl PartialEq for Inner {
    fn eq(&self, other: &Self) -> bool {
        if self.len != other.len {
            return false;
        }
        // NOTE(emilio): In order to speed up custom property comparison when tons of custom
        // properties are involved, we return false in some cases where the ordering might be
        // different, but the computed values end up being the same.
        //
        // This is a performance trade-off, on the assumption that if the ordering is different,
        // there's likely a different value as well, but might over-invalidate.
        //
        // Doing the slow thing (checking all the keys) shows up a lot in profiles, see
        // bug 1926423.
        //
        // Note that self.own_properties != other.own_properties is not the same, as by default
        // IndexMap comparison is not order-aware.
        if self.own_properties.as_slice() != other.own_properties.as_slice() {
            return false;
        }
        self.parent == other.parent
    }
}

impl Inner {
    fn iter(&self) -> Iter {
        Iter {
            current: self,
            current_iter: self.own_properties.iter(),
            descendants: Default::default(),
        }
    }

    fn is_empty(&self) -> bool {
        self.len == 0
    }

    fn len(&self) -> usize {
        self.len
    }

    fn get(&self, name: &Name) -> Option<&ComputedRegisteredValue> {
        if let Some(p) = self.own_properties.get(name) {
            return p.as_ref();
        }
        self.parent.as_ref()?.get(name)
    }

    fn insert(&mut self, name: &Name, value: Option<ComputedRegisteredValue>) {
        let new = self.own_properties.insert(name.clone(), value).is_none();
        if new && self.parent.as_ref().map_or(true, |p| p.get(name).is_none()) {
            self.len += 1;
        }
    }

    /// Whether we should expand the chain, or just copy-on-write.
    fn should_expand_chain(&self) -> bool {
        const SMALL_THRESHOLD: usize = 8;
        if self.own_properties.len() <= SMALL_THRESHOLD {
            return false; // Just copy, to avoid very long chains.
        }
        self.ancestor_count < ANCESTOR_COUNT_LIMIT as u8
    }
}

impl CustomPropertiesMap {
    /// Returns whether the map has no properties in it.
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Returns the amount of different properties in the map.
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// Returns the property name and value at a given index.
    pub fn get_index(&self, index: usize) -> Option<(&Name, &Option<ComputedRegisteredValue>)> {
        if index >= self.len() {
            return None;
        }
        // FIXME: This is O(n) which is a bit unfortunate.
        self.0.iter().nth(index)
    }

    /// Returns a given property value by name.
    pub fn get(&self, name: &Name) -> Option<&ComputedRegisteredValue> {
        self.0.get(name)
    }

    fn do_insert(&mut self, name: &Name, value: Option<ComputedRegisteredValue>) {
        if let Some(inner) = Arc::get_mut(&mut self.0) {
            return inner.insert(name, value);
        }
        if self.get(name) == value.as_ref() {
            return;
        }
        if !self.0.should_expand_chain() {
            return Arc::make_mut(&mut self.0).insert(name, value);
        }
        let len = self.0.len;
        let ancestor_count = self.0.ancestor_count + 1;
        let mut new_inner = Inner {
            own_properties: Default::default(),
            // FIXME: Would be nice to avoid this clone.
            parent: Some(self.0.clone()),
            len,
            ancestor_count,
        };
        new_inner.insert(name, value);
        self.0 = Arc::new(new_inner);
    }

    /// Inserts an element in the map.
    pub fn insert(&mut self, name: &Name, value: ComputedRegisteredValue) {
        self.do_insert(name, Some(value))
    }

    /// Removes an element from the map.
    pub fn remove(&mut self, name: &Name) {
        self.do_insert(name, None)
    }

    /// Shrinks the map as much as possible.
    pub fn shrink_to_fit(&mut self) {
        if let Some(inner) = Arc::get_mut(&mut self.0) {
            inner.own_properties.shrink_to_fit()
        }
    }

    /// Return iterator to go through all properties.
    pub fn iter(&self) -> Iter {
        self.0.iter()
    }
}
