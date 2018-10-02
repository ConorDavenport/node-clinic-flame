'use strict'

const fs = require('fs')
const path = require('path')
const { test } = require('tap')
const rimraf = require('rimraf')
const ClinicFlame = require('../index.js')
const { containsData } = require('./util/validate-output.js')

test('cmd - test collect - data exists', function (t) {
  const tool = new ClinicFlame()

  function cleanup (err, dirname) {
    t.ifError(err)

    let count = 0
    function callback (err) {
      t.ifError(err)
      if (++count === 2) {
        t.end()
      }
    }
    t.match(dirname, /^[0-9]+\.clinic-flame$/)
    rimraf(dirname, callback)
    fs.unlink(dirname + '.html', callback)
  }

  tool.collect(
    [process.execPath, path.join('test', 'fixtures', 'inspect.js')],
    function (err, dirname) {
      if (err) return cleanup(err, dirname)

      tool.visualize(dirname, dirname + '.html', function (err) {
        if (err) return cleanup(err, dirname)

        fs.readFile(dirname + '.html', function (err, content) {
          if (err) return cleanup(err, dirname)

          t.ok(containsData(content))
          cleanup(null, dirname)
        })
      })
    }
  )
})

test('cmd - test visualization - missing data', function (t) {
  const tool = new ClinicFlame({ debug: true })

  tool.visualize(
    'missing.clinic-flame',
    'missing.clinic-flame.html',
    function (err) {
      t.match(err.message, /ENOENT: no such file or directory/)
      t.end()
    }
  )
})

test('cmd - test collect - system info and data files', function (t) {
  const tool = new ClinicFlame()

  function cleanup (err, dirname) {
    t.ifError(err)
    t.match(dirname, /^[0-9]+\.clinic-flame$/)
    rimraf(dirname, (err) => {
      t.ifError(err)
      t.end()
    })
  }

  tool.collect(
    [process.execPath, path.join('test', 'fixtures', 'inspect.js')],
    function (err, dirname) {
      if (err) return cleanup(err, dirname)

      const basename = path.basename(dirname)
      const systeminfo = JSON.parse(fs.readFileSync(path.join(dirname, `${basename}-systeminfo`)))
      // check that samples data and inlined function data exists and is valid JSON
      JSON.parse(fs.readFileSync(path.join(dirname, `${basename}-samples`)))
      JSON.parse(fs.readFileSync(path.join(dirname, `${basename}-inlinedfunctions`)))

      t.ok(fs.statSync(systeminfo.mainDirectory).isDirectory())

      cleanup(null, dirname)
    }
  )
})
