#!/usr/bin/env node

require('..').run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
