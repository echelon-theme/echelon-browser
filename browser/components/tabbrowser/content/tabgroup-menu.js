/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// This is loaded into chrome windows with the subscript loader. Wrap in
// a block to prevent accidentally leaking globals onto `window`.
{
  const { TabStateFlusher } = ChromeUtils.importESModule(
    "resource:///modules/sessionstore/TabStateFlusher.sys.mjs"
  );

  class MozTabbrowserTabGroupMenu extends MozXULElement {
    static COLORS = [
      "blue",
      "purple",
      "cyan",
      "orange",
      "yellow",
      "pink",
      "green",
      "gray",
      "red",
    ];
    static markup = `
    <panel
        type="arrow"
        class="panel tab-group-editor-panel"
        orient="vertical"
        role="dialog"
        ignorekeys="true"
        norolluponanchor="true">
      <html:div class="panel-header">
        <html:h1 id="tab-group-editor-title-create" class="tab-group-create-mode-only" data-l10n-id="tab-group-editor-title-create"></html:h1>
        <html:h1 id="tab-group-editor-title-edit" class="tab-group-edit-mode-only" data-l10n-id="tab-group-editor-title-edit"></html:h1>
      </html:div>
      <toolbarseparator />
      <html:div class="panel-body tab-group-editor-name">
        <html:label for="tab-group-name" data-l10n-id="tab-group-editor-name-label"></html:label>
        <html:input id="tab-group-name" type="text" name="tab-group-name" value="" data-l10n-id="tab-group-editor-name-field" />
      </html:div>
      <html:div class="panel-body tab-group-editor-swatches" role="radiogroup" data-l10n-id="tab-group-editor-color-selector"/>
      <html:moz-button-group class="panel-body tab-group-create-actions tab-group-create-mode-only">
        <html:moz-button id="tab-group-editor-button-cancel" data-l10n-id="tab-group-editor-cancel"></html:moz-button>
        <html:moz-button type="primary" id="tab-group-editor-button-create" data-l10n-id="tab-group-editor-done"></html:moz-button>
      </html:moz-button-group>
      <toolbarseparator class="tab-group-edit-mode-only" />
      <html:div class="panel-body tab-group-edit-actions tab-group-edit-mode-only">
        <toolbarbutton tabindex="0" id="tabGroupEditor_addNewTabInGroup" class="subviewbutton" data-l10n-id="tab-group-editor-action-new-tab"></toolbarbutton>
        <toolbarbutton tabindex="0" id="tabGroupEditor_moveGroupToNewWindow" class="subviewbutton" data-l10n-id="tab-group-editor-action-new-window"></toolbarbutton>
        <toolbarbutton tabindex="0" id="tabGroupEditor_saveAndCloseGroup" class="subviewbutton" data-l10n-id="tab-group-editor-action-save"></toolbarbutton>
        <toolbarbutton tabindex="0" id="tabGroupEditor_ungroupTabs" class="subviewbutton" data-l10n-id="tab-group-editor-action-ungroup"></toolbarbutton>
      </html:div>
      <toolbarseparator class="tab-group-edit-mode-only" />
      <html:div class="tab-group-edit-mode-only panel-body tab-group-delete">
        <toolbarbutton tabindex="0" id="tabGroupEditor_deleteGroup" class="subviewbutton" data-l10n-id="tab-group-editor-action-delete"></toolbarbutton>
      </html:div>
    </panel>
       `;

    #activeGroup;
    #cancelButton;
    #createButton;
    #createMode;
    #keepNewlyCreatedGroup;
    #nameField;
    #panel;
    #swatches;
    #swatchesContainer;

    constructor() {
      super();
    }

    connectedCallback() {
      if (this._initialized) {
        return;
      }

      this.textContent = "";
      this.appendChild(this.constructor.fragment);
      this.initializeAttributeInheritance();

      this._initialized = true;

      this.#cancelButton = this.querySelector(
        "#tab-group-editor-button-cancel"
      );
      this.#createButton = this.querySelector(
        "#tab-group-editor-button-create"
      );
      this.#panel = this.querySelector("panel");
      this.#nameField = this.querySelector("#tab-group-name");
      this.#swatchesContainer = this.querySelector(
        ".tab-group-editor-swatches"
      );
      this.#populateSwatches();

      this.#cancelButton.addEventListener("click", () => {
        this.close(false);
      });

      this.#createButton.addEventListener("click", () => {
        this.close();
      });

      this.#nameField.addEventListener("input", () => {
        if (this.activeGroup) {
          this.activeGroup.label = this.#nameField.value;
        }
      });

      document
        .getElementById("tabGroupEditor_addNewTabInGroup")
        .addEventListener("command", () => {
          this.#handleNewTabInGroup();
        });

      document
        .getElementById("tabGroupEditor_moveGroupToNewWindow")
        .addEventListener("command", () => {
          gBrowser.replaceGroupWithWindow(this.activeGroup);
        });

      document
        .getElementById("tabGroupEditor_ungroupTabs")
        .addEventListener("command", () => {
          this.#handleUngroup();
        });

      document
        .getElementById("tabGroupEditor_saveAndCloseGroup")
        .addEventListener("command", () => {
          this.#handleSaveAndClose();
        });

      document
        .getElementById("tabGroupEditor_deleteGroup")
        .addEventListener("command", () => {
          this.#handleDelete();
        });

      this.panel.addEventListener("popupshown", this);
      this.panel.addEventListener("popuphidden", this);
      this.panel.addEventListener("keypress", this);
      this.#swatchesContainer.addEventListener("change", this);
    }

    #populateSwatches() {
      this.#clearSwatches();
      for (let colorCode of MozTabbrowserTabGroupMenu.COLORS) {
        let input = document.createElement("input");
        input.id = `tab-group-editor-swatch-${colorCode}`;
        input.type = "radio";
        input.name = "tab-group-color";
        input.value = colorCode;
        let label = document.createElement("label");
        label.classList.add("tab-group-editor-swatch");
        label.setAttribute(
          "data-l10n-id",
          `tab-group-editor-color-selector2-${colorCode}`
        );
        label.htmlFor = input.id;
        label.style.setProperty(
          "--tabgroup-swatch-color",
          `var(--tab-group-color-${colorCode})`
        );
        label.style.setProperty(
          "--tabgroup-swatch-color-invert",
          `var(--tab-group-color-${colorCode}-invert)`
        );
        this.#swatchesContainer.append(input, label);
        this.#swatches.push(input);
      }
    }

    #clearSwatches() {
      this.#swatchesContainer.innerHTML = "";
      this.#swatches = [];
    }

    get createMode() {
      return this.#createMode;
    }

    set createMode(enableCreateMode) {
      this.#panel.classList.toggle(
        "tab-group-editor-mode-create",
        enableCreateMode
      );
      this.#panel.setAttribute(
        "aria-labelledby",
        enableCreateMode
          ? "tab-group-editor-title-create"
          : "tab-group-editor-title-edit"
      );
      this.#createMode = enableCreateMode;
    }

    get activeGroup() {
      return this.#activeGroup;
    }

    set activeGroup(group = null) {
      this.#activeGroup = group;
      this.#nameField.value = group ? group.label : "";
      this.#swatches.forEach(node => {
        if (group && node.value == group.color) {
          node.checked = true;
        } else {
          node.checked = false;
        }
      });
    }

    get nextUnusedColor() {
      let usedColors = [];
      gBrowser.getAllTabGroups().forEach(group => {
        usedColors.push(group.color);
      });
      let color = MozTabbrowserTabGroupMenu.COLORS.find(
        colorCode => !usedColors.includes(colorCode)
      );
      if (!color) {
        // if all colors are used, pick one randomly
        let randomIndex = Math.floor(
          Math.random() * MozTabbrowserTabGroupMenu.COLORS.length
        );
        color = MozTabbrowserTabGroupMenu.COLORS[randomIndex];
      }
      return color;
    }

    get panel() {
      return this.children[0];
    }

    get #panelPosition() {
      if (gBrowser.tabContainer.verticalMode) {
        return SidebarController._positionStart
          ? "topleft topright"
          : "topright topleft";
      }
      return "bottomleft topleft";
    }

    openCreateModal(group) {
      this.activeGroup = group;
      this.createMode = true;
      this.#panel.openPopup(group.firstChild, {
        position: this.#panelPosition,
      });
    }

    openEditModal(group) {
      this.activeGroup = group;
      this.createMode = false;
      this.#panel.openPopup(group.firstChild, {
        position: this.#panelPosition,
      });
      document.getElementById("tabGroupEditor_moveGroupToNewWindow").disabled =
        gBrowser.openTabs.length == this.activeGroup?.tabs.length;
      this.#maybeDisableSaveButton();
    }

    #maybeDisableSaveButton() {
      let flushes = [];
      this.activeGroup.tabs.forEach(tab => {
        flushes.push(TabStateFlusher.flush(tab.linkedBrowser));
      });
      Promise.allSettled(flushes).then(() => {
        document.getElementById("tabGroupEditor_saveAndCloseGroup").disabled =
          !SessionStore.shouldSaveTabGroup(this.activeGroup);
      });
    }

    close(keepNewlyCreatedGroup = true) {
      if (this.createMode) {
        this.#keepNewlyCreatedGroup = keepNewlyCreatedGroup;
      }
      this.#panel.hidePopup();
    }

    on_popupshown() {
      if (this.createMode) {
        this.#keepNewlyCreatedGroup = true;
      }
      this.#nameField.focus();
    }

    on_popuphidden() {
      if (this.createMode) {
        if (this.#keepNewlyCreatedGroup) {
          this.dispatchEvent(
            new CustomEvent("TabGroupCreateDone", { bubbles: true })
          );
        } else {
          this.activeGroup.ungroupTabs();
        }
      }
      this.activeGroup = null;
    }

    on_keypress(event) {
      if (event.defaultPrevented) {
        // The event has already been consumed inside of the panel.
        return;
      }

      switch (event.keyCode) {
        case KeyEvent.DOM_VK_ESCAPE:
          this.close(false);
          break;
        case KeyEvent.DOM_VK_RETURN:
          this.close();
          break;
      }
    }

    /**
     * change handler for color input
     */
    on_change(aEvent) {
      if (aEvent.target.name != "tab-group-color") {
        return;
      }
      if (this.activeGroup) {
        this.activeGroup.color = aEvent.target.value;
      }
    }

    async #handleNewTabInGroup() {
      let lastTab = this.activeGroup?.tabs.at(-1);
      let onTabOpened = async aEvent => {
        this.activeGroup?.addTabs([aEvent.target]);
        this.close();
        window.removeEventListener("TabOpen", onTabOpened);
      };
      window.addEventListener("TabOpen", onTabOpened);
      gBrowser.addAdjacentNewTab(lastTab);
    }

    #handleUngroup() {
      this.activeGroup?.ungroupTabs();
    }

    #handleSaveAndClose() {
      this.activeGroup.save();
      this.activeGroup.dispatchEvent(
        new CustomEvent("TabGroupSaved", { bubbles: true })
      );
      gBrowser.removeTabGroup(this.activeGroup);
    }

    #handleDelete() {
      gBrowser.removeTabGroup(this.activeGroup);
    }
  }

  customElements.define("tabgroup-menu", MozTabbrowserTabGroupMenu);
}
