# Krunker Free KR script
> a playwright automation to collect free kr

I wanted to write (for fun) a playwright script to collect free krunkies
it automatically logs you in, checks if you can collect free kr, clicks the free kr button, waits for the ad to finish & clicks spin button.  
  
**It works about half the time**.

I have spent *way too much* time on this and since i don't even really play anymore, i don't care to finish it. This started as a fun challenge but it's neither fun or productive anymore (atleast for me).

**You are free to pick it up & get it to work**  
  
my only ask is, if you get it to work, submit a pull request.  
DISCLAIMER: you will need pretty good knowledge of javascript, i used a bunch of async/promise stuff

## Problems
- the playwright chromium driver somehow does not properly initialize krunker so it's unusable
  - the webkit driver does not even support WebAssembly
  - i had to resort to firefox - that's why it's about 5x slower than chrome
- krunker uses 3+ different ad SDK's for the free kr ads
  - Ad in play / full screen apps - auto-close, so they **work well**.
  - Google ads (popup video) - has to be closed with x button, but can close itself. **works sometimes**
    - these videos sometimes have a "This video will play with sound, click continue" popup
    - this popup is hard to detect but sometimes the script closes it sucessfully
  - Google image ads - have to be closed with x button (material design) **almost never work**
- krunker seems to randomly pick an ad SDK for each day, so the whole day you'll get the same SDK
- reporting of how many kr you spinned is unreliable
- you could just wait a relly long time for the ad window to close itself, but then you usually get kicked by inactivity.
- there are a bunch of `// TODO ...` comments - you can see what i had planned, feel free to implement those.

## Curent status
- **unreliable**. works on good days but fails more often.

## FAQ
- is this legit? - yes. it does what a user would do, login, watch the ad, spin the wheel
- will i continue to work on it? - most likely no, unless krunker makes their ad SDK's more reliable.
- does krunker get money from the ads? - i see no reason they shouldn't i don't do anything wierd to the ads

## Setup
1. clone the repo, `npm i`
2. create an `accounts.json` file: it should look like this:
   ```json
   [
	{ "name": "account1", "password": "password" },
	// ...
   ]
   ```
   you can switch between accounts (for testing) in the last async function, on the line:
   ```
   const _creds = credentials[0] // change this number to change the account
   ```
3. (optional) set `debug = true` in the top of `main.js` to see what it's doing
4. run `npm run start`