# Static List Data (SLID) Format

Static List Data (SLID) Format is a static data format similar to JSON, but
modeled on Mesgjs syntax rather than JavaScript syntax. The SLID format was
created by Brian Katzung in 2025\.

Instead of (potentially) composing a nested structure of arrays and plain
objects like JSON, SLID always composes a (potentially) nested structure of
`NANOS` (named and numbered ordered storage) JavaScript class instances. Unlike
JSON, SLID cannot encode scalar values outside of a list.

The top-most list in SLID is called the SLID container. It begins with
"`[(`" and ends at the closest subsequent "`)]`". The starting "`[(`" is
not a valid character sequence in Mesgjs, so it offers a way to distinguish
between SLID content and Mesgjs code.

If you need to include the text "`)]`" within SLID, backslash-escape the
bracket ("`)\]`"). On the other hand, if you need "`)\]`", backslash-escape
the backslash ("`)\\]`") in a quoted string.

Nested (inner) list values within the top-most list begin with "`[`" and
end at a matching (balanced) "`]`". Do NOT use SLID container delimiters
"`[(`" and "`)]`" for _nested_ lists.

List items may be either standalone values or take the form _key_\=_value_. Keys
may be either non-negative integers or text (AKA "strings"). Standalone values
are assigned the next index key (a non-negative integer, starting at 0, and 1
more than the highest index used in the list _so far_). Index keys may appear in
either numeric or string form, as long as strings contain no leading zeroes
(i.e. '0' is equivalent to 0, but '007' is not equivalent to 7).

```
[( hello=world first second '3'=fourth fifth )] is equivalent to
[( hello=world 0=first 1=second 3=fourth 4=fifth )]
```

# Value Types

## Numbers

These mostly match JavaScript's definitions of integers, big integers, and
floating-point numbers, except that SLID (and Mesgjs) do not support the digit
grouping character ("`_`").

Like JavaScript, standard integers may include `0b`, `0o`, or `0x` between the
optional sign and value for binary, octal, or hexadecimal values (e.g. `-0o17`),
and big integers are indicated by a trailing "`n`" (e.g. `10n`).

Scientific notation is also recognized for floating-point numbers.

## Text "Strings"

SLID (and Mesgjs) accept text strings in three formats: 'single-quoted text',
"double-quoted text", and word-literals. Quoted strings support JavaScript-style
escape sequences (such as `\'`, `\"`, or `\\` to include a quote or backslash
within a quoted string).

Word-literals are character sequences which do not match other patterns, and are
terminated by white-space or the first characters of other tokens (`'`, `"`, `[`, `=`, `]`, etc.).

Of particular note, commas are not special characters in SLID (or
Mesgjs), so they may be included as part of word-literals (e.g. "`hello, world`"
(without the quotes) is two word-literals, "`hello,`" and "`world`").

### Special Word-Literal Values

`@e` \- (as a standalone "value") is empty (leaves a hole and advances to the next
index)\
`@f`, `@n`, `@t`, `@u` \- Mesgjs equivalents of JavaScript `false`, `null`, `true`, and `undefined`, respectively

Mesgjs' `@gss` and `@mps` (global and module) namespace names are not special in
SLID.

Future (or domain-specific) implementations may support additional
special values beginning with `@`. For this reason, general use of the
word-literal format for other types of values beginning with `@` should
be considered unsafe and one of the quoted variants used instead in
order to avoid potential confusion, uncertainty, and/or misinterpretation.

### Mesgjs Special Characters In SLID

As a _static data_ format, SLID does not support Mesgjs code blocks, message
syntax, or the `%`, `#`, or `!` namespace references in any of their variations.

The "`{`", "`}`", "`%`", "`#`", and "`!`" characters may safely appear as part of (unquoted) word-literals in SLID, _even though they are not valid word-literal
characters in Mesgjs._

While "`(`" has no special meaning, "`)`" is the first character of "`)]`", the
SLID-container end marker. As word-literals are not permitted to contain
characters that begin other tokens, ")" is prohibited outside of quoted text.
_For symmetry_, "`(`" is prohibited as well.

# Lists

As previously mentioned, use `[(` and `)]` for the SLID container (outermost
list), and `[` and `]` for nested (inner) lists. Lists may not be used as
keys.

# Comments

SLID ignores content between `/*` and the closest subsequent `*/` appearing
outside of quoted strings. Comments do delimit tokens, however, so
`hello/**/world`  would result in two word-literals,
`hello` and `world`, not `helloworld`. Comments may span multiple lines.

SLID does _not_ support Mesgjs' single-line comment format (`//`).

# A Note About Key Ordering

`NANOS` allows key/value pairs to be either appended (the default mode, and the
mode used by SLID) or inserted. Appended values are added in the **last key
position that maintains the ascending order of indexed values**. Inserted values
are added in the **first** key position that maintains the order of indexed
values.

```
[( hello=bonjour 1=second goodbye='au revoir' 0=first )] is equivalent to
[( hello=bonjour first second goodbye='au revoir' )] (0 in last key position before 1)
```

# Quoted-String Escape Sequences

- `\b` \- backspace
- `\n` \- newline
- `\r` \- carriage return
- `\t` \- horizontal tab
- `\u`_`HHHH`_ \- character codes up to 16 bits as four hexadecimal digits
- `\x`_`HH`_ \- character codes up to 8 bits as two hexadecimal digits
- `\'` \- single quote
- `\"` \- double quote
- `\\` \- backslash

# Examples

- `[(value1 keyA=valueA value2 keyB=[value3 keyC=2] value4)]`
  - Positional values `value1` through `value4` at `0`, `1`, `['keyB', 0]`, and `2`.
  - Named values with keys `keyA`, `keyB`, and `['keyB', 'keyC']`.

## Representation Of A Simple HTML Document Structure

```
[(html
    [head
	[title 'HTML As SLID']
    ]
    [body
	/* [tag properties... children...] */
	[h1 'This is so SLID!']
	[p style='font-family: sans-serif;' 'Hello, world']
	[a href='https://example.com' target=_blank example.com]
    ]
)]
```
