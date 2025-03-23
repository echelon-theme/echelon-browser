/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var CustomTitlebar = {
  init() {
    this._readPref();
    Services.prefs.addObserver(this._prefName, this);
    this._style = Services.prefs.getIntPref(this._stylePrefName);
    Services.prefs.addObserver(this._stylePrefName, this);
    

    this._windowObserver = new MutationObserver(() => {
      let sizemode = document.documentElement.getAttribute("sizemode");
      if (sizemode != this.sizemode) {
        this.sizemode = sizemode;
        this._update();
      }
    });
    this._windowObserver.observe(document.documentElement, {attributes: true, attributeFilter: ["sizemode"]});

    let menu = document.getElementById("toolbar-menubar");
    this._menuObserver = new MutationObserver((aMutations) => {
      for (let mutation of aMutations) {
        if (mutation.attributeName == "inactive" ||
            mutation.attributeName == "autohide") {
          CustomTitlebar._update();
          return;
        }
      }
    });
    this._menuObserver.observe(menu, {attributes: true});

    this._initialized = true;
    this._update();
  },

  allowedBy(condition, allow) {
    if (allow) {
      if (condition in this._disallowed) {
        delete this._disallowed[condition];
        this._update();
      }
    } else if (!(condition in this._disallowed)) {
      this._disallowed[condition] = null;
      this._update();
    }
  },

  get systemSupported() {
    let isSupported = false;
    switch (AppConstants.MOZ_WIDGET_TOOLKIT) {
      case "windows":
      case "cocoa":
        isSupported = true;
        break;
      case "gtk":
        isSupported = window.matchMedia("(-moz-gtk-csd-available)").matches;
        break;
    }
    delete this.systemSupported;
    return (this.systemSupported = isSupported);
  },

  get enabled() {
    return document.documentElement.hasAttribute("customtitlebar");
  },

  observe(subject, topic, data) {
    if (topic == "nsPref:changed") {
      switch (data) {
        case this._prefName:
          this._readPref();
          break;
        case this._stylePrefName: {
          let style = Services.prefs.getIntPref(this._stylePrefName);
          if (style != this._style) {
            this._style = style;
            this._update();
          }
          break;
        }
      }
    }
  },

  _initialized: false,
  _disallowed: {},
  _style: 0,
  _prefName: "browser.tabs.inTitlebar",
  _stylePrefName: "echelon.theme.os-style",

  _readPref() {
    let hiddenTitlebar = Services.appinfo.drawInTitlebar;
    this.allowedBy("pref", hiddenTitlebar);
  },

  _update() {
    if (!this._initialized) {
      return;
    }

    let allowed =
      this.systemSupported &&
      !window.fullScreen &&
      !Object.keys(this._disallowed).length;

    let titlebar = document.getElementById("titlebar");
    let titlebarContent = document.getElementById("titlebar-content");

    this._hidePlaceholder("appmenu-button");
    this._hidePlaceholder("caption-buttons");
    titlebarContent.style.marginBottom = null;
    titlebar.style.marginBottom = null;
    if (allowed && !TabsOnBottom.enabled) {
      if (this.sizemode == "maximized") {
        // Size placeholders
        let appmenuButtonBox = document.getElementById("appmenu-button-container");
        this._sizePlaceholder("appmenu-button", appmenuButtonBox.getBoundingClientRect().width);
        let captionButtonsBox = document.querySelector(".titlebar-buttonbox");
        this._sizePlaceholder("caption-buttons", captionButtonsBox.getBoundingClientRect().width);

        // Merge titlebar and tabs toolbar
        let titlebarHeight = titlebar.getBoundingClientRect().height;
        let tabsAndMenuHeight = document.getElementById("TabsToolbar").getBoundingClientRect().height
          + document.getElementById("toolbar-menubar").getBoundingClientRect().height;
        let titlebarContentHeight = titlebarContent.getBoundingClientRect().height;
        if (tabsAndMenuHeight > titlebarContentHeight) {
          let titlebarContentMargin = tabsAndMenuHeight - titlebarContentHeight;
          titlebarContent.style.marginBottom = titlebarContentMargin + "px";
          titlebarHeight += titlebarContentMargin;
        }
        titlebar.style.marginBottom = -titlebarHeight + "px";
      // Stretch titlebar into tabs on non-XP normal size windows.
      // Old Firefox used a CSS hack for this, but I don't want to.
      } else if (this.sizemode == "normal" && this._style >= 1) {
        let tabsAndMenuHeight = document.getElementById("TabsToolbar").getBoundingClientRect().height
          + document.getElementById("toolbar-menubar").getBoundingClientRect().height;
        titlebarContent.style.marginBottom = tabsAndMenuHeight + "px";
        titlebar.style.marginBottom = -tabsAndMenuHeight + "px";
      }
    }

    document.documentElement.toggleAttribute("customtitlebar", allowed);
    if (AppConstants.platform == "macosx") {
      document.documentElement.toggleAttribute("drawtitle", !allowed);
    }

    ToolbarIconColor.inferFromText("customtitlebar", allowed);
    TabBarVisibility.update(true);
  },

  updateAppearance() {
    this._update();
  },

  uninit() {
    Services.prefs.removeObserver(this._prefName, this);
    Services.prefs.removeObserver(this._stylePrefName, this);
    this._windowObserver.disconnect();
    this._menuObserver.disconnect();
  },

  _sizePlaceholder(aType, aWidth) {
    for (placeholder of document.querySelectorAll(`.titlebar-placeholder[type="${aType}"]`)) {
      placeholder.style.width = aWidth + "px";
      placeholder.hidden = false;
    }
  },

  _hidePlaceholder(aType) {
    for (placeholder of document.querySelectorAll(`.titlebar-placeholder[type="${aType}"]`)) {
      placeholder.hidden = true;
    }
  },
};
