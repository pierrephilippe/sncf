module.exports = {
  ci: {
    collect: {
      startServerCommand: "npm run start -- -H 127.0.0.1 -p 3002",
      startServerReadyPattern: "Ready",
      startServerReadyTimeout: 60000,
      url: ["http://127.0.0.1:3002/"],
      numberOfRuns: 1,
      settings: {
        onlyCategories: ["accessibility"],
        formFactor: "mobile",
        screenEmulation: {
          mobile: true,
          width: 390,
          height: 844,
          deviceScaleFactor: 3,
          disabled: false,
        },
        throttlingMethod: "provided",
        chromeFlags: "--headless=new --no-sandbox",
      },
    },
    assert: {
      assertions: {
        "categories:accessibility": ["error", { minScore: 1 }],
        "color-contrast": "error",
        "button-name": "error",
        "link-name": "error",
        "label": "error",
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
    },
  },
};
