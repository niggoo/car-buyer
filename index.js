const cheerio = require('cheerio');
const request = require('sync-request');
const fs = require('fs');
const botCheckerText = "leastFactor";

let cookie = '';

const args = [];

process.argv.slice(2).forEach((val, index) => {
    if (index % 2 === 0) {
        args.push({
            "type": val
        });
    } else {
        args[(index - 1) / 2]["url"] = val;
    }
});
let cars = [];
args.forEach(a => {
    const cardata = getCarData(a.url, a.type);
    cars = cars.concat(cardata);
});

cars = cars.sort((a, b) => b.age - a.age);

fs.writeFileSync("raw_data.json", JSON.stringify(cars));

const years = [...new Set(cars.map(c => c.age))];

const results = years.map(year => {
    const result = {year};
    args.forEach(arg => {
        let matchingCars = cars.filter(c => c.type === arg.type && c.age === year);
        if (matchingCars.length) {
            result[arg.type] = Math.round(matchingCars.reduce((a, b) => a + b.price, 0) / matchingCars.length);
        } else {
            result[arg.type] = null;
        }
    });
    return result;
});

const lines = ['Age;' + args.map(a => a.type).join(';')].concat(
    results.map(r => r.year + ';' + args.map(a => r[a.type]).join(';'))
);

fs.writeFileSync("result.csv", lines.join(("\n")));

function fetchCarPage(url, page) {

    let response;
    do {
        response = request('GET', url + '&page=' + page, {
            headers: {
                'cookie': cookie,
            },
        }).body.toString();
        if (response.includes(botCheckerText)) {
            const botCheckerHtml = cheerio.load(response);
            const botCheckerScript = botCheckerHtml('script')[0].children[0].data;

            const manipulatedScript = "module = undefined;" + botCheckerScript.replace('document.location.reload(true);', '')
                    .replace(/document\.cookie=(.*);/gm, 'return $1')
                + '\ngo();';
            cookie = eval(manipulatedScript).split(';')[0];
        }
    } while (response.includes(botCheckerText));
    return response;
}

function getCarData(url, type) {
    let data = [];
    let page = 1;

    let response;
    let articles = [];

    try {

        do {
            response = fetchCarPage(url, page);

            const $ = cheerio.load(response);

            articles = $('#skip-to-resultlist')[0].children
                .filter(c => c.type === 'tag' && c.name === 'div' && !isNaN(c.attribs.id));

            data = data.concat(articles.map(a => parseArticleInfo(a, type))
                .filter(a => a.age && a.price));

            console.log("Fetching car data for page " + page + " of car " + type);
            page++;

        } while (articles.length > 0);
    }catch (e) {
        console.log("Something went wrong!")
    }

    return data;
}

function parseArticleInfo(a, type) {
    const title = a.children[1].children[0].children[0].children[0].data;
    let age = null
    try {
        age = +a.children[2].children[0].children[0].children[0].children[0].data;
    } catch (e) {
        try {
            if (a.children[2].children[0].children[0].children[1].children[2].data.toLowerCase().trim() == "neuwagen") {
                age = new Date().getFullYear()
            } else {
                console.log("Failed to parse age!")
            }
        } catch (e) {
            console.log("Failed to parse for neuwagen");
        }
    }
    let miles = null;
    try {
        miles = +a.children[2].children[0].children[1].children[0].children[0].data.replace('.', '');
    } catch (e) {
        console.log("Failed to parse miles!");
    }
    let price = null;
    try {
        price = +a.children[2].children[2].children[1].children[0].data.replace('€', '').replace('.', '')
    } catch (e) {
        console.log("Failed to parse price!");
    }


    return {
        title,
        age,
        miles,
        price,
        type
    };
}

