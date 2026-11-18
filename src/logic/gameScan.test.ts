import { describe, expect, it } from 'vitest';
import tiny from '../game/fixtures/tiny-game.json';
import { FILE_NAMES, GAME_FILE_MAX, filesProblems, scanGameFiles } from './gameScan';

const clean = { 'index.html': '<div id="app"></div>', 'game.js': 'GameStudio.ready();' };
const withJs = (js: string) => scanGameFiles({ ...clean, 'game.js': js }).join(' | ');

describe('scanGameFiles', () => {
  it('passes a clean game', () => expect(scanGameFiles(clean)).toEqual([]));
  it('names the two files and their limits', () => {
    expect(FILE_NAMES).toEqual(['index.html', 'game.js']);
    expect(GAME_FILE_MAX).toEqual({ 'index.html': 16000, 'game.js': 32000 });
  });

  it.each([
    ['fetch("x")', 'contacts another website'],
    ['new XMLHttpRequest()', 'contacts another website'],
    ['new WebSocket("x")', 'contacts another website'],
    ['new RTCPeerConnection()', 'contacts another website'],
    ['import("./x.js")', 'loads code from elsewhere'],
    ['document.createElement("iframe")', 'loads code from elsewhere'],
    ['window.open("x")', 'leaves the page'],
    ['location.href = "x"', 'leaves the page'],
    ['top.location = "x"', 'leaves the page'],
    ['self.location = "x"', 'leaves the page'],
    ['globalThis.location.href = "x"', 'leaves the page'],
    ['frames.location = "x"', 'leaves the page'],
    ['opener.location = "x"', 'leaves the page'],
    ['window["location"] = "x"', 'leaves the page'],
    ['window[\'open\']("x")', 'leaves the page'],
    ['self.open("x")', 'leaves the page'],
    ['globalThis.open("x")', 'leaves the page'],
    ['document.querySelector("f").submit()', 'submits a form'],
    ['document.cookie', 'uses browser storage'],
    ['localStorage.setItem("a", 1)', 'uses browser storage'],
    ['indexedDB.open("x")', 'uses browser storage'],
    ['eval("1+1")', 'runs code from text'],
    ['new Function("return 1")', 'runs code from text'],
  ])('reports %s', (js, message) => expect(withJs(js)).toContain(message));

  it.each([
    ['<iframe src="x"></iframe>', 'loads code from elsewhere'],
    ['<script src="x.js"></script>', 'loads code from elsewhere'],
    ['<link rel="stylesheet" href="x.css">', 'loads code from elsewhere'],
    ['<form><input></form>', 'submits a form'],
    ['<meta http-equiv="refresh" content="0">', 'leaves the page'],
  ])('reports %s in the HTML', (html, message) => expect(scanGameFiles({ 'index.html': html }).join(' ')).toContain(message));

  it('reports a web address even inside a comment', () => {
    expect(withJs('// docs: https://example.com\nGameStudio.ready();')).toContain('contains a web address');
    expect(scanGameFiles({ 'index.html': '<!-- https://example.com --><p></p>' }).join(' ')).toContain('contains a web address');
  });
  it('reports a missing index.html', () => expect(scanGameFiles({ 'game.js': '1' }).join(' ')).toContain('has no index.html'));
  it('accepts game.js at 32,000 characters and reports 32,001 as too large', () => {
    expect(scanGameFiles({ ...clean, 'game.js': 'x'.repeat(32000) })).toEqual([]);
    expect(withJs('x'.repeat(32001))).toContain('game.js is too large');
  });
  it('reports index.html over 16,000 characters', () => expect(scanGameFiles({ 'index.html': 'x'.repeat(16001) }).join(' ')).toContain('index.html is too large'));
});

describe('filesProblems', () => {
  it('accepts the two files as text', () => expect(filesProblems({ 'index.html': '<p></p>', 'game.js': '' })).toEqual([]));
  it('refuses a style.css key as an unexpected file', () => expect(filesProblems({ 'index.html': '<p></p>', 'style.css': 'p{}' }).join(' ')).toContain('Unexpected file style.css'));
  it('refuses files that are not text', () => expect(filesProblems({ 'index.html': { toString: 'x' } }).join(' ')).toContain('index.html must be text'));
  it('refuses a missing or non-object files value', () => {
    expect(filesProblems(null).join(' ')).toContain('no code');
    expect(filesProblems(['x']).join(' ')).toContain('no code');
  });
});

describe('the tiny game fixture', () => {
  it('passes both checks', () => {
    expect(filesProblems(tiny.files)).toEqual([]);
    expect(scanGameFiles(tiny.files)).toEqual([]);
  });
});
