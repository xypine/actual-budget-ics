import { init, downloadBudget, shutdown, getTransactions, getPayees, getAccounts, getCategories } from '@actual-app/api';
import ical from 'ical-generator';
import { writeFileSync } from 'fs';
import { getVtimezoneComponent } from '@touch4it/ical-timezones';

// The URL of your actual finance server
const serverURL = process.env.serverURL;
// The password of your actual finance server
const password = process.env.password;
// The ID from Settings → Show advanced settings → Sync ID
const budgetID = process.env.budgetID;
// Port to listen on
const port = process.env.PORT || 3000;
// Allow downloading the ical file over HTTP
const allow_insecure_download = !!process.env.ALLOW_INSECURE_DOWNLOAD;
for (const env of [serverURL, password, budgetID]) {
	if (!env) {
		console.error("Missing a required environment variable");
		console.warn("serverURL, password, budgetID need to be set");
		process.exit(1);
	}
}

async function update() {
	console.log("====== sync start ======");
	await init({
		// Budget data will be cached locally here, in subdirectories for each file.
		dataDir: 'data',
		serverURL,
		password
	});

	await downloadBudget(budgetID);

	let payees = await getPayees();
	console.log("found", payees.length, "payees");
	let accounts = await getAccounts();
	console.log("found", accounts.length, "accounts");
	let categories = await getCategories();
	console.log("found", categories.length, "categories");

	let transactions = await getTransactions();
	console.log("found", transactions.length, "transactions");
	await shutdown();

	console.log("writing calendar to file");
	const calendar = ical({ name: 'Actual Finance Transactions' });
	calendar.timezone({
		generator: getVtimezoneComponent
	});

	console.log("creating events");
	transactions.forEach((transaction) => {
		// Registration Start Event
		const start = new Date(transaction.date);
		const account = accounts.find(a => a.id === transaction.account);
		const payee = payees.find(p => p.id === transaction.payee);
		const category = categories.find(c => c.id === transaction?.category);

		const accountName = account?.name || "Unknown Account";
		const payeeName = payee?.name || "Unknown Payee";
		const categoryName = category?.name || "No Category";

		calendar.createEvent({
			id: `${transaction.id}@actual-ics.ruta.fi`,
			start,
			allDay: true,
			summary: `${payeeName}`,
			description: `Account: ${accountName}\nAmount: ${transaction.amount / 100.0}€\nCategory: ${categoryName}\nNotes: ${transaction.notes}`,
		});
	});

	console.log("writing calendar to file");
	const str = calendar.toString();
	// write to file
	writeFileSync('actual.ics', str);
	console.log("====== sync done ======");
}

// run once on start, wait a second for the server to start
setTimeout(update, 1000);

// update every 24 hours
setInterval(update, 24 * 60 * 60 * 1000);

import express from 'express';
const app = express();
// provide a health check endpoint
app.get('/', (_req, res) => res.send('OK'));
// provide the ical file
app.get('/actual.ics', (req, res) => {
	const protocol = req.headers['x-forwarded-proto'] || req.protocol;
	if (protocol !== 'https' && !allow_insecure_download) {
		return res.status(400).send("HTTP is a unsecure protocol, please use HTTPS");
	}
	const pass = req.query.password;
	if (pass !== password) {
		return res.status(401).send("Unauthorized");
	}
	return res.sendFile('actual.ics', {
		root: process.cwd()
	})
});

app.listen(port, () => console.log(`Listening on port ${port}`));
