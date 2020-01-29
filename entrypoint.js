#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const yaml = require('js-yaml');

const { Spectral, isOpenApiv3 } = require('@stoplight/spectral');
const { stylish } = require('@stoplight/spectral/dist/formatters/stylish');

const SPECTRAL_CONFIG = '.spectral.yaml';

// Mapping of Spectral severity to GitHub Actions message level
const SEV_MAP = ['error', 'warning', 'debug', 'debug'];

// Figure out what we are checking.
let filename = 'openapi.yaml';
if (process.argv.length >= 3) {
  filename = process.argv[2];
}

// Make sure Spectral's config is set up properly to point to our custom rules.
if (fs.existsSync(SPECTRAL_CONFIG)) {
  // Modify existing file.
  const doc = yaml.safeLoad(fs.readFileSync(SPECTRAL_CONFIG, 'utf8'));

  if (!doc.extends) {
    doc.extends = [];
  }

  if (!doc.extends.includes('./isp-rules.yaml')) {
    doc.extends.push('./isp-rules.yaml');
  }

  fs.writeFileSync(SPECTRAL_CONFIG, yaml.dump(doc));
} else {
  // Create dummy file.
  fs.writeFileSync(SPECTRAL_CONFIG, 'extends:\n  - ./isp-rules.yaml\n');
}

// Run the thing!
let failLimit = 0;
if (process.env.FAIL_ON_WARNINGS) {
  failLimit = 1;
}

const doc = fs.readFileSync(filename, 'utf8');

const spectral = new Spectral();
spectral.registerFormat('oas3', isOpenApiv3);
spectral
  .loadRuleset(SPECTRAL_CONFIG)
  .then(() => spectral.run(doc, { resolve: { documentUri: filename } }))
  .then(results => {
    //console.log('here are the results', results);
    let errors = 0;

    for (let r of results) {
      if (r.severity <= failLimit) {
        errors++;
      }

      // If we are running in GitHub, output metadata to nicely annotate the UI.
      if (process.env.GITHUB_ACTIONS) {
        console.log(
          `::${SEV_MAP[r.severity]} file=${r.source},line=${
            r.range.start.line
          },col=${r.range.start.character}::${r.message}`
        );
      }
    }

    // Use the nice default formatter to display results.
    console.log(stylish(results));

    // Set the exit code (0 for success, 1 for failure).
    process.exit(errors > 0);
  });
