/*
 * Functions for string (un)escaping
 */

// Generate string escapes for JavaScript
export function escapeJSString (s) {
    // deno-lint-ignore no-control-regex
    return s.replace(/[\x00-\x1f'"\\\x7f-\uffff]/g, c => {
	switch (c) {
	case '\b': return '\\b';
	case '\n': return '\\n';
	case '\r': return '\\r';
	case '\t': return '\\t';
	case "'": return "\\'";
	case '"': return '\\"';
	case '\\': return '\\\\';
	}
	const cc = c.charCodeAt(), ccs = cc.toString(16);
	if (cc < 0x10) return '\\x0' + ccs;
	if (cc < 0x100) return '\\x' + ccs;
	if (cc < 0x1000) return '\\u0' + ccs;
	return '\\u' + ccs;
    });
}

// Convert an escapped (input) string into a raw (internal) string
export function unescapeJSString (input) {
    return input.replace(/\\[\\bnrt'"]|\\x[\da-fA-F]{2}|\\u[\da-fA-F]{4}/g, e => {
	switch (e[1]) {
	case '\\': case "'": case '"':
	case 'b': case 'n': case 'r': case 't':
	    return (({
		'\\': '\\', "'": "'", '"': '"',
		b: '\b', n: '\n', r: '\r', t: '\t'
	    })[e[1]]);
	case 'x': case 'u':
	    return String.fromCharCode(parseInt(e.substring(2), 16));
	}
    });
}

// END
