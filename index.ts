#!/usr/bin/env node

import yargs from "yargs";
import { RequestHandler } from "./main";
import { writeFileSync } from "fs";

const argv = yargs(process.argv.slice(2))
    .scriptName("key-gen")
    .option("ip", {
        alias: "ip",
        demandOption: true,
        describe: "IP address of the Host",
        type: "string",
    })
    .option("count", {
        alias: "count",
        demandOption: false,
        default: 1,
        describe: "Total key count",
        type: "number",
    })
    .help().argv;

(async () => {
    if ("then" in argv) throw new Error("Invalid args");

    const client = new RequestHandler(argv.ip);
    const keys = await client.init({
        email: "",
        password: "",
        keyCount: argv.count
    });
    writeFileSync(`./${argv.ip}.txt`, keys.join(','));
    console.log(`Keys retrieved ${keys.length}`);
})();
