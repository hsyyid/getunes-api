// Load sensitive variables from .env
require('dotenv').config();

const underTest = require('../src/api/spotify.js');

const chai = require("chai");
const expect = chai.expect;

const fs = require('fs');

// TODO: Rewrite test cases

describe('SpotifyTest', function() {
  this.timeout(0);
});
