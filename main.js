const playwright = require('playwright');
const fs = require("fs");

const debug = false
const credentials = JSON.parse(fs.readFileSync('./accounts.json'))

/** @param {playwright.Page} page page */
async function tryClosePopups(page, log = false) {
	const selectors = ["#bundlePop", '#popupBack', '#windowCloser', "#menuPopHider"].map(sel => page.locator(sel))
	await selectors.forEach(async (sel) => {
		if (sel.getAttribute("onclick")) {
			const clck = await sel.getAttribute("onclick")
			if (clck !== null) {
				if (log) console.log("attempting to run " + `window.${clck}`)
				await page.evaluate(`window.${clck}`).catch(e => console.log(e))
			}
		}
	})
}

/** 
 * @param {playwright.Page} page 
 * @param {{name: string, password: string}} creds
 * */
async function login(page, creds) {
	let loggedIn = true
	try {
		// these don't wait for #mainLogo or button.log
		await page.locator("#mainLogo").isVisible()
		await page.locator("button.lgn").isVisible()
		await page.waitForTimeout(1000)
		console.log("> attempting to log in - filling login form")
		await page.evaluate(() => window.showWindow(5))
		await page.locator("#accName").fill(creds.name)
		await page.locator("#accPass").fill(creds.password)
		await page.waitForFunction(() => typeof window['loginAcc'] === 'function')
		await page.evaluate(() => window.loginAcc()) 
		await page.waitForTimeout(1000)

		await page.locator("#signedInHeaderBar").waitFor({ state: 'visible', timeout: 20_000 })
		console.log("> logged in")
	} catch (e) {
		console.log("> error! couldn't log in!")
		console.error(e)
		loggedIn =  false
	}
	return loggedIn
}

/** 
 * expect expression to be truthy
 * @param expression expression to check
 * @param {string} message if expression is falsy, log message 
 * @param {playwright.Browser} browser
 * @returns boolean if expression was truthy/falsy
 */
async function expect(expression, message, browser) {
	if (expression) {
		return true
	} else {
		console.log("! " + message)
		await browser.close()
		return false
	}
}

/**
 * we have claimed kr, now just try to get its amount or exit.
 * @param {playwright.Page} page
 * @param {playwright.Browser} browser
 */
async function aftercare(page, browser) {
	try { 
		const krElem = page.locator('#spinItemName', { hasText: "KR" })
		await krElem.waitFor({ state: 'attached' })
		const kr = await krElem.textContent()
		console.log(`> got ${kr}`)
		// await page.pause() 
		await page.locator("#spinUI").click()
	} catch (e) { 
		console.log("! got kr but couldn't get amount!")
	}
	console.log("> successfully claimed kr")
	await browser.close()
}

/** 
 * create a promise that returns true if sucessfully clicked 
 * farmeLocator(selector) on adFrame locator
 * @param {playwright.Locator} adFrame ad frame to check
 * @param {string} selector
 * @return {Promise}
 */
function adSkipPromise(adFrame, selector) {
	return new Promise(async (resolve, reject) => {
		try {
			await adFrame.frameLocator(selector).click(); 
			resolve(true)
		} catch (e) { reject() }
	})
}

/** @param {{name: string, password: string}} credentials credentials */
async function getFreeKR(credentials) {
	const launchOptions = {   }
	if (debug) Object.assign(launchOptions, { headless: false })

	const browser = await playwright.firefox.launch(launchOptions);
	const page = await browser.newPage();
	await page.goto('https://krunker.io');
	console.log("> loaded krunker.io")
	// if (debug) await page.pause()

	// accept cookies
	await page.locator("#onetrust-accept-btn-handler").click()
	console.log("> accepted cookies")

	await page.waitForFunction(() => typeof window['setSetting'] === 'function')
	await page.evaluate(() => window.windows[0].toggleType({ checked: true }))
	// not working, disabled settings
	// await page.evaluate(() => window.aspectSelect("aspectRatio", { value: '800x600' }))
	// await page.evaluate(() => window.delayExecute("sound", { value: 0 }, undefined))

	await page.evaluate(() => {
		window.setSetting('lowSpec', true)
		window.setSetting('resolution', 0.1)
		window.setSetting('updateRate', 0.1)
	})
	console.log("> updated settings")

	// login
	const loggedIn = await login(page, credentials)
	if (!(await expect(loggedIn, "failed to log in!", browser))) return 0

	await tryClosePopups(page)

	// check if we can redeem free kr
	await page.evaluate(() => { window.setSetting('updateRate', 0.1) })
	await page.evaluate(() => window.showWindow(14))
	await page.evaluate(() => window.windows[13].switchTab(1))

	let krTime = page.locator(".shopCard .spinValH .spinValL")
	const coolDownElemFound = await krTime.filter({ hasText: ":" }).count() > 0
	console.log(`> found ${await krTime.filter({ hasText: ":" }).count()} generic .spinValL element(s)`)

	// if we found a cooldown, expect it to be hidden, otherwise fail
	if (coolDownElemFound) {
		/** @type {playwright.Locator} */
		const krTimeElem = await krTime.filter({ hasText: ":" }).first()

		if (!(await expect(await krTimeElem.isHidden(), "cant' claim kr: " + await krTimeElem.textContent(), browser))) return -1
	}
	console.log("> proceeding to claim kr, no cooldown found")

	await page.waitForFunction(() => typeof window['claimReward'] === 'function')
	await page.evaluate(() => window.claimReward())
	console.log("> called claimReward()")

	await tryClosePopups(page)

	console.log("> looking for ad iframe")
	let canContinue = true
	try {
		// all iframes with ads for freekr (to my knowledge) have 'krunker' and 'display-reward' in their id.
		// i could make the selector more specific but this works for now
		const ADFRAME_LOCATOR = 'iframe[id*="display-reward"][id*="krunker"]'
		const adFrame = await page.locator(ADFRAME_LOCATOR).first() // popup ad frame with x button (google?)
		console.log("> found ad frame", await adFrame.isVisible(), adFrame)
		// """interact with iframe so no audio popups open""" (prolly doese't work)
		await adFrame.dispatchEvent('click') // pause the vid
		await adFrame.dispatchEvent('click') // play the vid

		// FIXME the spinbutton detection is unreliable from what i can tell
		const adVisibleAfter30sec = await new Promise(async (resolve) => {
			try {
				await adFrame.waitFor({ state: 'visible', timeout: 45_000 })
				resolve(true)
			} catch (e) { resolve(false) }
		})
		if (!(await expect(await page.locator("#spinButton").isVisible() || adVisibleAfter30sec, 'ad iframe not even visible after 45s', browser))) return 0
		if (await page.locator("#spinButton").isVisible()) { 
			await page.locator("#spinButton").click()
			await aftercare(page, browser)
			return 1
		}

		// await page.pause()

		console.log("> attempting to skip ads")
		// try to click different skip buttons
		// the promises don't even need a waitfor, as long as the trycatch fails them on default timeout < cleanup promise timeout
		// full ending of id: frvr-krunker_io-krunker-display-reward-default_0
		const promises = [
			adSkipPromise(adFrame, 'button[name="Skip Ad"]'), // fullpage skip
			adSkipPromise(adFrame, '#close_button_icon'), // satic warthunder google ad with material design x
			new Promise(async (resolve, reject) => {
				try { // google popup X button
					await page.frameLocator(ADFRAME_LOCATOR).locator("img").nth(2).click(); 
					resolve(true)
				} catch (e) { reject() }
			}),
			new Promise(async (resolve, reject) => {
				try { // play with sound button
					await page.frameLocator(ADFRAME_LOCATOR).getByText('Continue', { exact: true }).click(); 
					reject() // even if clicks the play with sound, ad is still not skipped
				} catch (e) { reject() }
			}),
			// max time to wait until it gives up - resolves, but to false
			new Promise(async (resolve) => setTimeout(() => resolve(false), 30_000))
		]
		const sucessfullySkipped = await Promise.any(promises) // any sucessful promise - after 30 seconds it gives up
		console.log("> sucessfullySkippedAd: " + sucessfullySkipped)

		await page.locator("#spinButton").waitFor({ state: 'visible', timeout: 30_000 })
		await page.evaluate(() => { window.setSetting('updateRate', 0) })
		await page.locator("#spinButton").click()
	} catch (e) {
		canContinue = false
		await browser.close()
		console.log("! spin button not present after 60 seconds")
	}
	if (!canContinue) return 0
	
	await aftercare(page, browser)
	return 1
}

(async () => {
	let retries = 15
	let lastResult
	const _creds = credentials[0]
	console.log("> attempting to claim FreeKR for " + _creds.name)
	while (retries > 0) {
		console.log(`>>> retries left: ${retries}`)
		let result = 0
		try {
			result = await getFreeKR(_creds)
		} catch (e) {
			console.error(e)
			console.log("getFreeKR somehow failed! retrying as if has returned 0")
		}
		if (result === -1) {
			retries = 0
			lastResult = "-1: couldn't claim kr because of timeout"
			break;
		} else if (result === 0) {
			retries -= 1
			lastResult = "0: failed because some other reason; retrying..."
		} else if (result === 1) {
			retries = 0
			lastResult = `1: sucessfully collected kr for user ${_creds.name}`
			break;
		}
	}
	console.log("script execution finshed.")
	console.log(lastResult)
})();

//TODO handle wrong username or password
// TODO docker support & deployment
// TODO logging earnings
// TODO log how long it took to wait for ad into a file