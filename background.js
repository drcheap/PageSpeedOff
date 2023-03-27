"use strict";

const CURRENT_STORAGE_VERSION = 2;

/* These constants should match those in options.js */
const MODE_GLOBAL = "global";
const MODE_PERSITE = "persite";

var isDisabled = true;  // State used when Global Mode is activated (true means inject the header to disable PageSpeed)
var operatingMode = MODE_PERSITE;

async function initialize(details)
{
   console.log("(init) Initializing...");

   // Show an update notification if needed
   if(details.reason === "update" && details.previousVersion.startsWith("1.0."))
   {
      browser.tabs.create({"url": "/release-2.0.0.html"});
   }

   // Preset initialization
   let storage = await browser.storage.local.get(["isDisabled","version","mode","globalDisabled","persiteSettings"]);
   if(storage.version === undefined)
   {
      storage.version = 1; // Had non-versioned preset storage, so treat it as version 1
   }

   if(Number.isInteger(storage.version))
   {
      if(storage.version < CURRENT_STORAGE_VERSION)
      {
         // Storage is old, do any necessary upgrades to remain compatible
         if(storage.version == 1)
         {
            console.log("(update) Migrating storage from version 1 to 2...");
            if("isDisabled" in storage)
            {
               await browser.storage.local.remove("isDisabled");  // Old setting, no longer used
            }

            storage.version = 2;
         }

         if(storage.version == 2)
         {
            // (future storage updates here)
         }

         await browser.storage.local.set({"version": storage.version});
      }
   }
   else
   {
      console.log("(init) No storage version tag found, initializing...");
      await browser.storage.local.set({"version": CURRENT_STORAGE_VERSION});
   }

   if(storage.mode === undefined)
   {
      console.log("(init) No mode setting found, initializing...");
      storage.mode = MODE_PERSITE;
      await browser.storage.local.set({"mode": storage.mode});
   }

   if(storage.globalDisabled === undefined)
   {
      console.log("(init) No globalDisabled setting found, initializing...");
      storage.globalDisabled = true;
      await browser.storage.local.set({"globalDisabled": storage.globalDisabled});
   }
   else
   {
      isDisabled = storage.globalDisabled;
   }

   if(storage.persiteSettings === undefined)
   {
      console.log("(init) No persiteSettings setting found, initializing...");
      storage.persiteSettings = new Map();
      await browser.storage.local.set({"persiteSettings": [...storage.persiteSettings]});
   }
   else
   {
      storage.persiteSettings = new Map(storage.persiteSettings);
   }

   console.log("(init) Initialization complete...");
   console.log("(init)    Storage version: " + storage.version);
   console.log("(init)    Mode: " + storage.mode);
   console.log("(init)    Global disabled: " + storage.globalDisabled);
   console.log("(init)    Per-site setting count: " + storage.persiteSettings.size);

   await loadSettings();
}

async function loadSettings()
{
   console.log("Loading stored settings...");

   let storage = await browser.storage.local.get(["version","mode","globalDisabled"]);
   if(storage === undefined || storage.version === undefined || storage.version !== CURRENT_STORAGE_VERSION)
   {
      console.log("Settings not fully initialized yet");
      return; // Nothing to load yet
   }

   let globalDisabled = storage.globalDisabled;
   if(globalDisabled !== undefined)
   {
      isDisabled = globalDisabled;
   }

   let mode = storage.mode;
   if(mode !== undefined)
   {
      operatingMode = mode;
   }

   await setAllToolbarIcons();
}

async function isSiteDisabled(site)
{
   if(site !== undefined && site.length > 0)
   {
      let storage = await browser.storage.local.get("persiteSettings");
      let persiteSettings = new Map(storage.persiteSettings);
      let thisSite = persiteSettings.get(site);
      return thisSite !== undefined && thisSite.isDisabled;
   }

   return false;
}

async function setSiteDisabled(site, disabled)
{
   if(site !== undefined && site.length > 0)
   {
      let storage = await browser.storage.local.get("persiteSettings");
      let persiteSettings = new Map(storage.persiteSettings);
      let thisSite = persiteSettings.has(site) ? persiteSettings.get(site) : {};
      console.log("(setSiteDisabled) changing: " + thisSite.isDisabled + " -> " + disabled);
      thisSite.isDisabled = disabled;
      persiteSettings.set(site, thisSite);
      await browser.storage.local.set({"persiteSettings": [...persiteSettings]});
   }
}

function getHostnameFromURL(url)
{
   try {
      return new URL(url).hostname;
   } catch {
      return "";
   }
}

async function toggle(tab)
{
   let site = getHostnameFromURL(tab.url);
   let thisSiteDisabled = false;

   console.log("(toggle) tab " + tab.id + " at " + site);

   if(operatingMode === MODE_GLOBAL)
   {
      isDisabled = !isDisabled;
      thisSiteDisabled = isDisabled;
      await browser.storage.local.set({"globalDisabled": isDisabled});  // Persist new global state
      updateToolbarIcon(thisSiteDisabled);
   }
   else if(operatingMode === MODE_PERSITE)
   {
      if(site.length > 0)
      {
         thisSiteDisabled = !await isSiteDisabled(site);
         await setSiteDisabled(site, thisSiteDisabled);  // Persist new per-site state
      }
      updateToolbarIcon(thisSiteDisabled, tab.id);

      // Also update icon for any other visible tabs at this same site
      let allTabs = await browser.tabs.query({"active": true, "currentWindow": false});
      await Promise.all(allTabs.map(async (otherTab) => {
         if(otherTab.id !== tab.id && getHostnameFromURL(otherTab.url) === site)
         {
            updateToolbarIcon(thisSiteDisabled, otherTab.id);
         }
      }));
   }

   browser.runtime.sendMessage({"toggle": true});
}

async function setIconByURL(url, tabId)
{
   let site = getHostnameFromURL(url);
   console.log("(setIconByURL) tab " + tabId + " at " + site);
   updateToolbarIcon(await isSiteDisabled(site), tabId);
}

function updateToolbarIcon(thisSiteDisabled = false, tabId)
{
   let slash = "";
   let title = "PageSpeedOff (Allowing usage)";
   if(thisSiteDisabled)
   {
      slash = "-slash";
      title = "PageSpeedOff (Requesting to not use)";
   }

   let iconParams = {
      "path": {
         "16": "icons/logo-16" + slash + ".png",
         "32": "icons/logo-32" + slash + ".png"
      }
   };

   let titleParams = {
      "title": title
   };

   if(tabId !== undefined && tabId >= 0)
   {
      iconParams.tabId = tabId;
      titleParams.tabId = tabId;
   }

   browser.browserAction.setIcon(iconParams);
   browser.browserAction.setTitle(titleParams);

   console.log("(updateToolbarIcon) " + tabId + ": " + title);
}

async function setAllToolbarIcons()
{
   let allTabs = await browser.tabs.query({});
   if(operatingMode === MODE_GLOBAL)
   {
      // Clear per-tab icons & titles, & then set global
      console.log("(setAllToolbarIcons) clearing all");
      await Promise.all(allTabs.map(async (tab) => {
         await browser.browserAction.setIcon({"tabId": tab.id});
         await browser.browserAction.setTitle({"tabId": tab.id, "title": null})
      }));
      await updateToolbarIcon(isDisabled);
   }
   else if(operatingMode === MODE_PERSITE)
   {
      // Set per-tab icons
      console.log("(setAllToolbarIcons) setting all");
      await Promise.all(allTabs.map(async (tab) => {
         await setIconByURL(tab.url, tab.id);
      }));
   }
}

async function setPageSpeedHeader(e)
{
   let headers = e.requestHeaders;
   let site = getHostnameFromURL(e.url);

   let thisSiteDisabled = false;
   if(operatingMode === MODE_GLOBAL)
   {
      thisSiteDisabled = isDisabled;
   }
   else if(operatingMode === MODE_PERSITE)
   {
      thisSiteDisabled = await isSiteDisabled(site);
   }

   if(thisSiteDisabled)
   {
      let exists = false;
      for(let header of headers)
      {
         // Already exists, override
         if(header.name.toLowerCase() === "pagespeed")
         {
            console.log("(header) Modifying header");

            header.value = "off";
            exists = true;
            break;
         }
      }

      if(!exists)
      {
         // Does not exist, add it
         headers.push({"name": "PageSpeed", "value": "off"});
         console.log("(header) Added header for " + site);
      }
   }

   return {"requestHeaders": headers};
}

async function windowFocusHandler(windowId)
{
   console.log("(windowFocusHandler) windowId " + windowId);
   if(windowId != browser.windows.WINDOW_ID_NONE && operatingMode === MODE_PERSITE)
   {
      let activeTab = (await browser.tabs.query({"active": true, "currentWindow": true}))[0];
      await setIconByURL(activeTab.url, activeTab.id);
   }
}

async function tabActivationHandler(activeInfo)
{
   console.log("(tabActivationHandler) tab " + activeInfo.tabId);
   if(operatingMode === MODE_PERSITE)
   {
      let tabInfo = await browser.tabs.get(activeInfo.tabId);
      await setIconByURL(tabInfo.url, activeInfo.tabId);
   }
}

async function navigationHandler(tabId, changeInfo, tab)
{
   console.log("(navigationHandler) tab " + tabId);
   if(operatingMode === MODE_PERSITE)
   {
      await setIconByURL(changeInfo.url, tabId);
   }
}



browser.runtime.onInstalled.addListener(initialize);
browser.runtime.onMessage.addListener((msg) => {
   console.log("msg received: ");
   console.log(msg);
   if(msg.modeChange !== undefined)
   {
      operatingMode = msg.modeChange;
      setAllToolbarIcons();
   }
});

browser.webRequest.onBeforeSendHeaders.addListener(setPageSpeedHeader, {"urls": ["http://*/*", "https://*/*"]}, ["blocking", "requestHeaders"]);
browser.browserAction.onClicked.addListener(toggle);
browser.windows.onFocusChanged.addListener(windowFocusHandler);
browser.tabs.onActivated.addListener(tabActivationHandler);
browser.tabs.onUpdated.addListener(navigationHandler, {properties: ["url"]});

document.addEventListener("DOMContentLoaded", loadSettings);
