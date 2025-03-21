/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

<%namespace name="helpers" file="/helpers.mako.rs" />
<% from data import DEFAULT_RULES_AND_PAGE, POSITION_TRY_RULE, DEFAULT_RULES_AND_POSITION_TRY %>

${helpers.four_sides_shorthand(
    "margin",
    "margin-%s",
    "specified::Margin::parse",
    engines="gecko servo",
    spec="https://drafts.csswg.org/css-box/#propdef-margin",
    rule_types_allowed=DEFAULT_RULES_AND_PAGE | POSITION_TRY_RULE,
    allow_quirks="Yes",
)}

${helpers.two_properties_shorthand(
    "margin-block",
    "margin-block-start",
    "margin-block-end",
    "specified::Margin::parse",
    engines="gecko servo",
    spec="https://drafts.csswg.org/css-logical/#propdef-margin-block",
    rule_types_allowed=DEFAULT_RULES_AND_POSITION_TRY
)}

${helpers.two_properties_shorthand(
    "margin-inline",
    "margin-inline-start",
    "margin-inline-end",
    "specified::Margin::parse",
    engines="gecko servo",
    spec="https://drafts.csswg.org/css-logical/#propdef-margin-inline",
    rule_types_allowed=DEFAULT_RULES_AND_POSITION_TRY
)}

${helpers.four_sides_shorthand(
    "scroll-margin",
    "scroll-margin-%s",
    "specified::Length::parse",
    engines="gecko",
    spec="https://drafts.csswg.org/css-scroll-snap-1/#propdef-scroll-margin",
)}

${helpers.two_properties_shorthand(
    "scroll-margin-block",
    "scroll-margin-block-start",
    "scroll-margin-block-end",
    "specified::Length::parse",
    engines="gecko",
    spec="https://drafts.csswg.org/css-scroll-snap-1/#propdef-scroll-margin-block",
)}

${helpers.two_properties_shorthand(
    "scroll-margin-inline",
    "scroll-margin-inline-start",
    "scroll-margin-inline-end",
    "specified::Length::parse",
    engines="gecko",
    spec="https://drafts.csswg.org/css-scroll-snap-1/#propdef-scroll-margin-inline",
)}

// The -moz-outline-radius shorthand is non-standard and not on a standards track.
<%helpers:shorthand
    name="-moz-outline-radius"
    engines="gecko"
    sub_properties="${' '.join(
        '-moz-outline-radius-%s' % corner
        for corner in ['topleft', 'topright', 'bottomright', 'bottomleft']
    )}"
    spec="Nonstandard (https://developer.mozilla.org/en-US/docs/Web/CSS/-moz-outline-radius)"
>
    use crate::values::generics::rect::Rect;
    use crate::values::specified::border::BorderRadius;
    use crate::parser::Parse;
    pub fn parse_value<'i, 't>(
        context: &ParserContext,
        input: &mut Parser<'i, 't>,
    ) -> Result<Longhands, ParseError<'i>> {
        let radii = BorderRadius::parse(context, input)?;
        Ok(expanded! {
            _moz_outline_radius_topleft: radii.top_left,
            _moz_outline_radius_topright: radii.top_right,
            _moz_outline_radius_bottomright: radii.bottom_right,
            _moz_outline_radius_bottomleft: radii.bottom_left,
        })
    }
    impl<'a> ToCss for LonghandsToSerialize<'a>  {
        fn to_css<W>(&self, dest: &mut CssWriter<W>) -> fmt::Result where W: fmt::Write {
            use crate::values::generics::border::BorderCornerRadius;
            let LonghandsToSerialize {
                _moz_outline_radius_topleft: &BorderCornerRadius(ref tl),
                _moz_outline_radius_topright: &BorderCornerRadius(ref tr),
                _moz_outline_radius_bottomright: &BorderCornerRadius(ref br),
                _moz_outline_radius_bottomleft: &BorderCornerRadius(ref bl),
            } = *self;
            let widths = Rect::new(tl.width(), tr.width(), br.width(), bl.width());
            let heights = Rect::new(tl.height(), tr.height(), br.height(), bl.height());
            BorderRadius::serialize_rects(widths, heights, dest)
        }
    }
</%helpers:shorthand>