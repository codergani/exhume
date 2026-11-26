import { describe, expect, it } from 'vitest'
import { cleanReadmeText } from '../src/lib/readmeClean'

describe('cleanReadmeText: HTML', () => {
  it('removes an img tag', () => {
    expect(cleanReadmeText('<img src="x.png" alt="logo">')).toBe('')
  })

  it('removes tags and keeps the text between them', () => {
    expect(cleanReadmeText('<p align="center">Hi</p>')).toBe('Hi')
  })

  it('removes br and br/', () => {
    expect(cleanReadmeText('a<br>b<br/>c')).toBe('abc')
  })

  it('removes a multi-line tag with attributes', () => {
    expect(cleanReadmeText('x <img\n  src="x.png"\n  alt="logo"\n> y')).toBe('x  y')
  })

  it('removes a single-line comment', () => {
    expect(cleanReadmeText('a <!-- note --> b')).toBe('a  b')
  })

  it('removes a multi-line comment', () => {
    expect(cleanReadmeText('a\n<!--\nhidden\nlines\n-->\nb')).toBe('a\n\nb')
  })

  it('leaves an unclosed comment as written', () => {
    expect(cleanReadmeText('a <!-- b')).toBe('a <!-- b')
  })

  it('leaves <https://example.com> unchanged', () => {
    expect(cleanReadmeText('<https://example.com>')).toBe('<https://example.com>')
  })

  it('leaves a < b > c unchanged', () => {
    expect(cleanReadmeText('a < b > c')).toBe('a < b > c')
  })
})

describe('cleanReadmeText: images and links', () => {
  it('removes an image', () => {
    expect(cleanReadmeText('a ![alt](https://x.y/i.png) b')).toBe('a  b')
  })

  it('removes a linked-image badge entirely', () => {
    expect(
      cleanReadmeText('[![Build](https://img.shields.io/x.svg)](https://ci.example)'),
    ).toBe('')
  })

  it('collapses the empty line left by two adjacent badges', () => {
    const badges = '[![A](https://i/a.svg)](https://a)[![B](https://i/b.svg)](https://b)'
    expect(cleanReadmeText(`x\n\n${badges}\n\ny`)).toBe('x\n\ny')
  })

  it('converts a link to its text', () => {
    expect(cleanReadmeText('[text](https://x.y)')).toBe('text')
  })

  it('converts a link with a title to its text', () => {
    expect(cleanReadmeText('See [the docs](https://x.y "Docs").')).toBe('See the docs.')
  })

  it('leaves nothing for a link with empty text', () => {
    expect(cleanReadmeText('a[](https://x.y)b')).toBe('ab')
  })

  it('removes the tag inside link text', () => {
    expect(cleanReadmeText('[<b>x</b>](u)')).toBe('x')
  })
})

describe('cleanReadmeText: headings', () => {
  it('strips heading markers', () => {
    expect(cleanReadmeText('# Title\n## Sub\n###### Six')).toBe('Title\nSub\nSix')
  })

  it('strips a marker indented by 3 spaces', () => {
    expect(cleanReadmeText('   ## Sub')).toBe('Sub')
  })

  it('leaves #hashtag, #!/bin/sh and 7 hashes unchanged', () => {
    expect(cleanReadmeText('#hashtag')).toBe('#hashtag')
    expect(cleanReadmeText('#!/bin/sh')).toBe('#!/bin/sh')
    expect(cleanReadmeText('####### seven')).toBe('####### seven')
  })
})

describe('cleanReadmeText: whitespace', () => {
  it('leaves 1 blank line unchanged', () => {
    expect(cleanReadmeText('a\n\nb')).toBe('a\n\nb')
  })

  it('turns 2, 3 and 5 blank lines into 1', () => {
    expect(cleanReadmeText('a\n\n\nb')).toBe('a\n\nb')
    expect(cleanReadmeText('a\n\n\n\nb')).toBe('a\n\nb')
    expect(cleanReadmeText('a\n\n\n\n\n\nb')).toBe('a\n\nb')
  })

  it('treats whitespace-only lines as blank', () => {
    expect(cleanReadmeText('a\n  \n\t\nb')).toBe('a\n\nb')
  })

  it('normalises CRLF and lone CR', () => {
    expect(cleanReadmeText('a\r\n\r\n\r\n\r\nb')).toBe('a\n\nb')
    expect(cleanReadmeText('a\rb')).toBe('a\nb')
  })

  it('trims leading and trailing whitespace', () => {
    expect(cleanReadmeText('\n\n  a  \n\n')).toBe('a')
  })
})

describe('cleanReadmeText: totals', () => {
  it('returns an empty string for only badges and tags', () => {
    const input = [
      '<p align="center">',
      '  <img src="logo.png">',
      '</p>',
      '[![Build](https://i/b.svg)](https://ci)',
    ].join('\n')
    expect(cleanReadmeText(input)).toBe('')
  })

  it('leaves plain and code-like text unchanged', () => {
    const input = 'const a = [1, 2][0]\nif (x) { run(a) }\nplain words.'
    expect(cleanReadmeText(input)).toBe(input)
  })

  it('returns equal output for equal input', () => {
    const input = '# T\n\n[a](b) <i>c</i>\n\n\n\nd'
    expect(cleanReadmeText(input)).toBe(cleanReadmeText(input))
  })

  it('returns an empty string for non-string input', () => {
    expect(cleanReadmeText(undefined as unknown as string)).toBe('')
    expect(cleanReadmeText(null as unknown as string)).toBe('')
  })
})

describe('cleanReadmeText: realistic sample', () => {
  it('cleans a typical README to an exact string', () => {
    const input = [
      '<p align="center">',
      '  <img src="logo.png" alt="Widget" width="120">',
      '</p>',
      '',
      '# Widget',
      '',
      '[![Build](https://img.shields.io/b.svg)](https://ci.example) [![npm](https://img.shields.io/n.svg)](https://npm.example)',
      '',
      '<!-- toc -->',
      '',
      '## Install',
      '',
      'See [the docs](https://x.y "Docs") for more.   ',
      '',
      '```sh',
      'npm install widget',
      '```',
      '',
    ].join('\n')
    const expected = [
      'Widget',
      '',
      'Install',
      '',
      'See the docs for more.',
      '',
      '```sh',
      'npm install widget',
      '```',
    ].join('\n')
    expect(cleanReadmeText(input)).toBe(expected)
  })
})

describe('cleanReadmeText: pathological inputs', () => {
  const cases: Array<[string, string]> = [
    ['100000 open brackets', '['.repeat(100000)],
    ['100000 open tags', '<a '.repeat(100000)],
    ['50000 bangs then a bracket', '!'.repeat(50000) + '['],
    ['50000 unclosed comments', '<!--'.repeat(50000)],
    ['100000 spaces then x', ' '.repeat(100000) + 'x'],
  ]

  it.each(cases)('finishes fast on %s', (_name, input) => {
    const t0 = performance.now()
    const out = cleanReadmeText(input)
    const elapsed = performance.now() - t0
    expect(typeof out).toBe('string')
    expect(elapsed).toBeLessThan(1000)
  })
})
