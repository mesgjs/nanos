import terser from "npm:@rollup/plugin-terser";

export default [
{
    input: 'src/nanos.esm.js',
    external: [ 'escape-js/escape.esm.js' ],
    output: [
	{
	    file: 'dist/nanos.min.esm.js',
	    format: 'es',
	    plugins: [terser()],
	    sourcemap: true,
	},
    ],
},
];
