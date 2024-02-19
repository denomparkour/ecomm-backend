const express = require("express");
const mysql = require("mysql2");
const app = express();
const solr = require("solr-client");
const pluralize = require("pluralize");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();
const port = process.env.PORT || 8080;
const mysql_host = process.env.MYSQL_HOST;
const mysql_user = process.env.MYSQL_USER;
const mysql_password = process.env.MYSQL_PASSWORD;
const mysql_db = process.env.MYSQL_DB;
const solr_host = process.env.SOLR_HOST;
const solr_port = process.env.SOLR_PORT;
const solr_core = process.env.SOLR_CORE;
const solr_url = `http://${solr_host}:${solr_port}/solr/${solr_core}/update?commit=true`;
console.log(solr_url);
app.use(cors());
app.use(express.json());

const connection = mysql.createConnection({
  host: mysql_host,
  user: mysql_user,
  password: mysql_password,
  database: mysql_db,
});

const client = solr.createClient({
  host: solr_host,
  port: solr_port,
  core: solr_core,
  protocol: "http",
});

connection.connect((err) => {
  if (err) {
    console.log("error", err);
  } else {
    console.log("Database connected successfully!");
  }
});

function fetchAndIndexProducts() {
  const sqlQuery = "SELECT * FROM products";

  connection.query(sqlQuery, (err, results) => {
    if (err) {
      console.error("Error fetching products from SQL:", err);
      return;
    }
    indexProductsInSolr(results);
  });
}

function indexProductsInSolr(products) {
  client.deleteAll();
  products.forEach((product) => {
    client.add(product, () => {
      client.commit(() => {
        console.log("Product indexed in Solr:", product);
      });
    });
  });
}
setTimeout(() => {
  console.log("Indexing data")
  fetchAndIndexProducts()
}, 10000)
function singularizeWord(word) {
  const exceptions = ["Louis", "louis", "shoes"];
  const words = word.split(/\s+/);
  const singularizedWords = words.map((word) => {
    if (exceptions.includes(word)) {
      return word;
    } else {
      return pluralize.singular(word);
    }
  });

  return singularizedWords.join(" ");
}

app.post("/categories", (req, res) => {
  console.count("categories page triggered");
  try {
    const query = "select * from categories;";
    connection.query(query, (err, result) => {
      if (err) throw err;
      res.json(result);
    });
  } catch (err) {
    console.log(err);
  }
});
app.post("/products/:id?", (req, res) => {
  console.count("Products Page triggered");
  try {
    const params = req.params.id;
    if (!params) {
      const query = `select * from products`;
      connection.query(query, (err, result) => {
        if (err) throw err;
        res.json(result);
      });
    } else {
      const query = `select * from products where category_id=${req.params.id}`;
      connection.query(query, (err, result) => {
        try {
          res.json(result);
        } catch (e) {
          console.log(e);
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
});

app.post("/solr", async (req, res) => {
  var price = "";
  var query = "";
  var data = "";
  var relatedquery = "";
  var relateddata = "";
  var queryType = "";
  var islessthan = false;
  var isgreaterthan = false;
  var onlyPureNumbers = [];
  var withKValues = [];
  try {
    var userQuery = req.body.query.trim();
    userQuery = singularizeWord(userQuery);
    let hasAnd = false;
    if (userQuery.includes("and")) {
      hasAnd = true;
    }
    const andSplit = userQuery.split(" and ");
    querySplit = userQuery.split(" ");
    const underKeywords = ["under", "below", "less than"];
    const greaterKeywords = ["above", "higher", "greater than", "from"];
    const betweenKeywords = ["between"];
    let lessthan = false;
    let greaterthan = false;
    let isBetween = false;
    underKeywords.forEach((keyword) => {
      if (userQuery.toLowerCase().includes(keyword)) {
        lessthan = true;
      }
    });

    greaterKeywords.forEach((keyword) => {
      if (userQuery.toLowerCase().includes(keyword)) {
        greaterthan = true;
      }
    });
    betweenKeywords.forEach((keyword) => {
      if (userQuery.toLowerCase().includes(keyword)) {
        isBetween = true;
      }
    });

    querySplit.forEach((value) => {
      if (!isNaN(value) && typeof value !== "boolean") {
        onlyPureNumbers.push(Number(value));
      } else if (/^\d+k$/i.test(value)) {
        withKValues.push(Number(value.substring(0, value.length - 1)) * 1000);
      }
    });

    try {
      if (lessthan && (onlyPureNumbers.length > 0 || withKValues.length > 0)) {
        if (!withKValues.length > 0) {
          query = client
            .query()
            .q(
              `product_name:*${userQuery}* OR product_brand:*${userQuery}* OR product_category:*${userQuery}*`
            )
            .fq({ field: "mrp", value: `[* TO ${onlyPureNumbers[0]}]` })
            .defType("edismax")
            .qf({ product_name: 2, product_category: 1 });
        }
        if (!onlyPureNumbers.length > 0) {
          query = client
            .query()
            .q(
              `product_name:*${userQuery}* OR product_brand:*${userQuery}* OR product_category:*${userQuery}*`
            )
            .fq({ field: "mrp", value: `[* TO ${withKValues[0]}]` })
            .defType("edismax")
            .qf({ product_name: 2, product_category: 1 });
        }

        try {
          data = await client.search(query);
        } catch (e) {
          console.log(e);
        }
      }
      if (
        greaterthan &&
        (onlyPureNumbers.length > 0 || withKValues.length > 0)
      ) {
        console.log("this is above");
        if (!withKValues.length > 0) {
          query = client
            .query()
            .q(
              `product_name:*${userQuery}* OR product_brand:*${userQuery}* OR product_category:*${userQuery}*`
            )
            .fq({ field: "mrp", value: `[${onlyPureNumbers[0]} TO *]` })
            .defType("edismax")
            .qf({ product_name: 2, product_category: 1 });
        }
        if (!onlyPureNumbers.length > 0) {
          query = client
            .query()
            .q(
              `product_name:*${userQuery}* OR product_brand:*${userQuery}* OR product_category:*${userQuery}*`
            )
            .fq({ field: "mrp", value: `[${withKValues[0]} TO *]` })
            .defType("edismax")
            .qf({ product_name: 2, product_category: 1 });
        }
      }
      if (isBetween) {
        var minValue;
        var maxValue;
        function extractRangeValues(inputString) {
          const regex = /between\s+(\d+)\s+and\s+(\d+)/i;
          const match = inputString.match(regex);
          if (match) {
            minValue = parseInt(match[1], 10);
            maxValue = parseInt(match[2], 10);
            return { minValue, maxValue };
          } else {
            return null;
          }
        }
        const extractedValues = extractRangeValues(userQuery);
        if (minValue && maxValue) {
          console.log("this came");
          query = client
            .query()
            .q(
              `product_name:*${userQuery}* OR product_brand:*${userQuery}* OR product_category:*${userQuery}*`
            )
            .fq({
              field: "mrp",
              value: `[${extractedValues.minValue} TO ${extractedValues.maxValue}]`,
            })
            .defType("edismax")
            .qf({ product_name: 2, product_category: 1 });
        } else {
          query = client
            .query()
            .q(
              `product_name:*${userQuery}* OR product_brand:*${userQuery}* OR product_category:*${userQuery}*`
            )
            .defType("edismax")
            .qf({ product_name: 2, product_category: 1 });
        }
        try {
          data = await client.search(query);
        } catch (e) {
          console.log(e);
        }
      }
      if (hasAnd && !isBetween) {
        const underKeywords = ["under", "below", "less than"];
        const greaterKeywords = ["above", "higher", "greater than", "from"];

        function parseQuery(queryString) {
          const productNames = queryString.split(" and ");
          const solrQuery = productNames
            .map((name) => `product_name:*${name}* OR product_brand:*${name}*`)
            .join(" OR ");

          return solrQuery;
        }

        const userq = parseQuery(userQuery);
        underKeywords.forEach((keyword) => {
          if (userQuery.toLowerCase().includes(keyword)) {
            islessthan = true;
          }
        });

        greaterKeywords.forEach((keyword) => {
          if (userQuery.toLowerCase().includes(keyword)) {
            greaterthan = true;
          }
        });
        const onlyPureNumbers = [];
        const withKValues = [];
        querySplit.forEach((value) => {
          if (!isNaN(value) && typeof value !== "boolean") {
            onlyPureNumbers.push(Number(value));
          } else if (/^\d+k$/i.test(value)) {
            withKValues.push(
              Number(value.substring(0, value.length - 1)) * 1000
            );
          }
        });
        if (
          islessthan &&
          (onlyPureNumbers.length > 0 || withKValues.length > 0)
        ) {
          if (!withKValues.length > 0) {
            query = client
              .query()
              .q(userq)
              .fq({ field: "mrp", value: `[* TO ${onlyPureNumbers[0]}]` })
              .defType("edismax")
              .qf({ product_name: 2, product_category: 1 });
          }
          if (!onlyPureNumbers.length > 0) {
            query = client
              .query()
              .q(userq)
              .fq({ field: "mrp", value: `[* TO ${withKValues[0]}]` })
              .defType("edismax")
              .qf({ product_name: 2, product_category: 1 });
          }
        }
        if (
          isgreaterthan &&
          (onlyPureNumbers.length > 0 || withKValues.length > 0)
        ) {
          if (!withKValues.length > 0) {
            query = client
              .query()
              .q(
                `product_name:*${userQuery}* OR product_brand:*${userQuery}* OR product_category:*${userQuery}*`
              )
              .fq({ field: "mrp", value: `[${onlyPureNumbers[0]} TO *]` })
              .defType("edismax")
              .qf({ product_name: 2, product_category: 1 });
          }
          if (!onlyPureNumbers.length > 0) {
            query = client
              .query()
              .q(
                `product_name:*${userQuery}* OR product_brand:*${userQuery}* OR product_category:*${userQuery}*`
              )
              .fq({ field: "mrp", value: `[${withKValues[0]} TO *]` })
              .defType("edismax")
              .qf({ product_name: 2, product_category: 1 });
          }
        }
        if (!islessthan && !isgreaterthan) {
          query = client
            .query()
            .q(userq)
            .qf({ product_name: 2, product_category: 1 });
        }
      }
      try {
        data = await client.search(query);
      } catch (e) {
        console.log(e);
      }
      if (
        !lessthan &&
        !greaterthan &&
        !isBetween &&
        !hasAnd &&
        !islessthan &&
        !isgreaterthan &&
        (!onlyPureNumbers.length > 0 || !withKValues.length > 0)
      ) {
        query = client
          .query()
          .q(
            `product_name:*${userQuery}* OR product_brand:*${userQuery}* OR product_category:*${userQuery}*`
          )
          .defType("edismax")
          .qf({ product_name: 2, product_category: 1 })
          .rows(5);
        data = await client.search(query);
      }
    } catch (e) {
      console.log(e);
    }

    try {
      const categoryId = data?.response?.docs?.map(
        (doc) => doc.category_id[0]
      )[0];
      const filteredProducts = data.response?.docs?.map(
        (product) => product.product_id
      )[0];
      relatedquery = client
        .query()
        .q(`category_id:${categoryId}`)
        .rows(5)
        .sort({ product_id: "desc" });
      tempData = await client.search(relatedquery);
      relateddata = tempData.response?.docs?.filter(
        (product) => +filteredProducts !== +product.product_id
      );
    } catch (err) {
      // console.log(err);
    }

    if (data.response?.numFound === 0) {
      function generateRandomNumber() {
        const randomDecimal = Math.random();
        const randomNumber = Math.floor(randomDecimal * 10) + 1;
        return randomNumber;
      }
      const randint = generateRandomNumber();
      var ordering = "";
      if (randint < 5) {
        ordering = "desc";
      } else {
        ordering = "asc";
      }
      query = client
        .query()
        .q(`category_id:${randint}`)
        .sort({ product_id: ordering })
        .rows(5);
      similarQuery = client
        .query()
        .q(
          `product_name:*${userQuery}* OR product_brand:*${userQuery}* OR product_category:*${userQuery}*`
        )
        .defType("edismax")
        .qf({ product_name: 2, product_category: 1 })
        .rows(5);
      try {
        data = await client.search(query);
        similarData = await client.search(similarQuery);
      } catch (e) {
        console.log(e);
      }
      res.json({ test: "notok", data: data, similarData: similarData });
    } else {
      res.json({ test: "ok", data: data, relateddata: relateddata });
    }
  } catch (err) {
    // console.log(err);
  }
});

app.listen(port, (err) => {
  if (!err) {
    console.log(`App is running at port ${port}`);
  } else {
    throw err;
  }
});
