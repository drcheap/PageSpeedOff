/* These constants should match those in background.js */
const MODE_GLOBAL = "global";
const MODE_PERSITE = "persite";

var operatingMode = MODE_PERSITE;

async function showModeDetails()
{
   document.querySelector("#currentGlobalState").style.display = "none";
   let gsSpan = document.querySelector("#gsSpan");
   gsSpan.textContent = "(unknown)";

   document.querySelector("#currentPersiteState").style.display = "none";
   let psSpan = document.querySelector("#psSpan");
   psSpan.textContent = "(none)";

   if(operatingMode === MODE_GLOBAL)
   {
      let storage = await browser.storage.local.get(["globalDisabled"]);
      let globalDisabled = storage.globalDisabled;
      gsSpan.textContent = globalDisabled ? "Requesting to not use" : "Allowing usage";
      document.querySelector("#currentGlobalState").style.display = "block";
   }
   else if(operatingMode === MODE_PERSITE)
   {
      let storage = await browser.storage.local.get(["persiteSettings"]);
      let persiteSettings = new Map(storage.persiteSettings);

      let ul = document.createElement("ul");

      for (const [site, thisSite] of persiteSettings.entries())
      {
         console.log("(persiteSettings) Found item " + site + ": " + thisSite.isDisabled);
         if(thisSite.isDisabled)
         {
            let li = document.createElement("li");
            li.textContent = site;
            ul.appendChild(li);
         }
      }

      if(ul.childElementCount > 0)
      {
         while(psSpan.firstChild)
         {
            psSpan.removeChild(psSpan.firstChild);
         }

         psSpan.appendChild(ul);
      }

      document.querySelector("#currentPersiteState").style.display = "block";
   }
}

async function doOnLoad()
{
   loadOptions();
}

async function loadOptions()
{
   let storage = await browser.storage.local.get("mode");
   let mode = storage.mode;

   if(mode !== undefined)
   {
      operatingMode = mode;
   }

   console.log("Operating mode: " + operatingMode);
   document.querySelector("input[name=operatingMode][value=" + operatingMode + "]").checked = true;

   await showModeDetails();
}

async function setOperatingMode()
{
   operatingMode = document.querySelector("input[name=operatingMode]:checked").value;
   console.log("Changing mode to: " + operatingMode);
   browser.storage.local.set({"mode": operatingMode});
   browser.runtime.sendMessage({"modeChange": operatingMode});

   await showModeDetails();
}

document.addEventListener("DOMContentLoaded", doOnLoad);
document.querySelectorAll("input[name=operatingMode]").forEach(i => { i.addEventListener("change", setOperatingMode) });
browser.runtime.onMessage.addListener((msg) => {
   console.log("msg received: ");
   console.log(msg);
   if(msg.toggle !== undefined)
   {
      loadOptions();
   }
});
