"use strict";

// Global state of plugin
var isDisabled = true;

function toggle()
{
   isDisabled = !isDisabled;
   applyState();
}

function applyState()
{
   // Persist state
   browser.storage.local.set({"isDisabled": isDisabled});

   // Update the toolbar to reflect current state
   let slash = "";
   let title = "Allow use of PageSpeed";
   if(isDisabled)
   {
      slash = "-slash";
      title = "Tell servers NOT to use PageSpeed";
   }

   browser.browserAction.setIcon({
      "path": {
         "16": "icons/logo-16" + slash + ".png",
         "32": "icons/logo-32" + slash + ".png"
      }
   });

   browser.browserAction.setTitle({"title": title});

   console.log("(apply) set state: isDisabled="+isDisabled);
}

function setPageSpeedHeader(e)
{
   let headers = e.requestHeaders;

   if(isDisabled)
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
         console.log("(header) Added header");
      }
   }

   return {"requestHeaders": headers};
}

// Load persisted state
browser.storage.local.get("isDisabled").then((obj) => {
   if(obj.hasOwnProperty("isDisabled"))
   {
      isDisabled = obj.isDisabled;
      console.log("(init) Loaded persistent state: isDisabled="+isDisabled);
   }
   else
   {
      console.log("(init) No persistent state found, initializing...");
      isDisabled = true;
   }

   applyState();
});

browser.webRequest.onBeforeSendHeaders.addListener(setPageSpeedHeader, {"urls": ["http://*/*", "https://*/*"]}, ["blocking", "requestHeaders"]);
browser.browserAction.onClicked.addListener(toggle);
