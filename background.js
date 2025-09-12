"use strict";

const CURRENT_STORAGE_VERSION = 2;

/* These constants should match those in options.js */
const MODE_GLOBAL = "global";
const MODE_PERSITE = "persite";

var isDisabled = true;  // State used when Global Mode is activated (true means inject the header to disable PageSpeed)
var operatingMode = MODE_PERSITE;

async function initialize(details)
{
   console.debug("Initializing...");

   // Preset initialization
   let storage = await browser.storage.local.get(["isDisabled","version","mode","globalDisabled","persiteSettings"]);
   if(Number.isInteger(storage.version))
   {
      if(storage.version < CURRENT_STORAGE_VERSION)
      {
         // Storage is old, do any necessary upgrades to remain compatible

         if(storage.version == 1)
         {
            console.warn("Migrating storage from version 1 to 2...");
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
      console.info("No storage version tag found, initializing...");
      storage.version = CURRENT_STORAGE_VERSION;
      await browser.storage.local.set({"version": storage.version});
   }

   if(storage.mode === undefined)
   {
      console.info("No mode setting found, initializing...");
      storage.mode = MODE_PERSITE;
      await browser.storage.local.set({"mode": storage.mode});
   }

   if(storage.globalDisabled === undefined)
   {
      console.info("No globalDisabled setting found, initializing...");
      storage.globalDisabled = true;
      await browser.storage.local.set({"globalDisabled": storage.globalDisabled});
   }
   else
   {
      isDisabled = storage.globalDisabled;
   }

   if(storage.persiteSettings === undefined)
   {
      console.info("No persiteSettings setting found, initializing...");
      storage.persiteSettings = new Map();
      await browser.storage.local.set({"persiteSettings": [...storage.persiteSettings]});
   }
   else
   {
      storage.persiteSettings = new Map(storage.persiteSettings);
   }

   loadSettings();

   console.debug("Initialization complete...");
   console.debug("   Storage version: " + storage.version);
   console.debug("   Mode: " + storage.mode);
   console.debug("   Global disabled: " + storage.globalDisabled);
   console.debug("   Per-site setting count: " + storage.persiteSettings.size);
}

async function loadSettings()
{
   console.debug("Loading stored settings...");

   let storage = await browser.storage.local.get(["version","mode","globalDisabled"]);
   if(storage === undefined || storage.version === undefined || storage.version !== CURRENT_STORAGE_VERSION)
   {
      console.warn("Settings not fully initialized yet");
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
      console.debug("Changing site setting: " + thisSite.isDisabled + " -> " + disabled);
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

   console.info("Toggle from tab " + tab.id + (site ? " at " + site : ""));

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
}

async function setIconByURL(url, tabId)
{
   let site = getHostnameFromURL(url);
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

   console.debug("Set icon" + (tabId ? "" : " for tab " + tabId) + ": " + title);
}

async function setAllToolbarIcons()
{
   let allTabs = await browser.tabs.query({});
   if(operatingMode === MODE_GLOBAL)
   {
      // Clear per-tab icons & titles, & then set global
      console.debug("Clearing all icons");
      await Promise.all(allTabs.map(async (tab) => {
         await browser.browserAction.setIcon({"tabId": tab.id});
         await browser.browserAction.setTitle({"tabId": tab.id, "title": null})
      }));
      await updateToolbarIcon(isDisabled);
   }
   else if(operatingMode === MODE_PERSITE)
   {
      // Set per-tab icons
      console.debug("Setting all icons");
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
            console.info("Modifying header for " + site);

            header.value = "off";
            exists = true;
            break;
         }
      }

      if(!exists)
      {
         // Does not exist, add it
         headers.push({"name": "PageSpeed", "value": "off"});
         console.info("Added header for " + site);
      }
   }

   return {"requestHeaders": headers};
}

async function windowFocusHandler(windowId)
{
   console.debug("Focused windowId " + windowId);
   if(windowId != browser.windows.WINDOW_ID_NONE && operatingMode === MODE_PERSITE)
   {
      let activeTab = (await browser.tabs.query({"active": true, "currentWindow": true}))[0];
      await setIconByURL(activeTab.url, activeTab.id);
   }
}

async function tabActivationHandler(activeInfo)
{
   console.debug("Activated tab " + activeInfo.tabId);
   if(operatingMode === MODE_PERSITE)
   {
      let tabInfo = await browser.tabs.get(activeInfo.tabId);
      await setIconByURL(tabInfo.url, activeInfo.tabId);
   }
}

async function navigationHandler(tabId, changeInfo, tab)
{
   console.debug("Navigation on tab " + tabId);
   if(operatingMode === MODE_PERSITE)
   {
      await setIconByURL(changeInfo.url, tabId);
   }
}


browser.runtime.onInstalled.addListener(initialize);
browser.runtime.onMessage.addListener((msg) => {
   console.debug("Message received", msg);
   if(msg.modeChange !== undefined)
   {
      operatingMode = msg.modeChange;
      setAllToolbarIcons();
   }
});
browser.browserAction.onClicked.addListener(toggle);
browser.webRequest.onBeforeSendHeaders.addListener(setPageSpeedHeader, {"urls": ["http://*/*", "https://*/*"]}, ["blocking", "requestHeaders"]);
browser.windows.onFocusChanged.addListener(windowFocusHandler);
browser.tabs.onActivated.addListener(tabActivationHandler);
browser.tabs.onUpdated.addListener(navigationHandler, {properties: ["url"]});

const manifest = browser.runtime.getManifest();
console.info(manifest.name + " version " + manifest.version + " by " + manifest.author);
loadSettings();
