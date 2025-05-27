import { createTool } from "@mastra/core";
import * as mathjs from "mathjs";
import { z } from "zod";

const TOOL_DESCRIPTION = `Evaluate mathematical expressions using math.js syntax. Supports:
- Arithmetic, logical, relational, bitwise, and matrix operations
- All math.js operators (e.g. +, -, *, /, ^, %, !, &, |, <<, >>, ==, <, >, <=, >=, and, or, xor, not, mod, to, in, :, etc.)
- Parentheses, implicit multiplication, multi-line and multi-statement expressions (using ; or \n)
- Built-in and user-defined functions (e.g. sin, cos, sqrt, log, f(x)=x^2)
- Constants (e.g. pi, e, i), variables, assignment, and comments (# ...)
- Data types: numbers, BigNumbers, complex numbers, booleans, units (with conversion), strings, arrays, matrices, and objects
- Matrix and array indexing (1-based), ranges, and element-wise operations (.* ./ .^)
- String manipulation, object property access, and function mapping (map, forEach)
- Examples: 2+3*4, sin(pi/4), 2 inch to cm, [1,2;3,4]*2, a=5; a^2, 2+3i, f(x)=x^2; f(3), [1,2,3][2], {a:2+1, b:4}'
`;

export const MathTool = createTool({
	id: "Math Tool",
	description: TOOL_DESCRIPTION,
	inputSchema: z.object({
		expression: z
			.string()
			.describe(
				"A mathematical expression in math.js syntax. Supports arithmetic, logical, bitwise, relational, matrix, unit, string, array, object, and function operations. Supports constants (pi, e, i), variables, assignment, comments (#), implicit multiplication, multi-line/statement, and unit conversion. Examples: 2+3*4, sin(pi/4), 2 inch to cm, [1,2;3,4]*2, a=5; a^2, 2+3i, f(x)=x^2; f(3), [1,2,3][2], {a:2+1, b:4}",
			),
	}),
	execute: async ({ context }) => {
		try {
			return mathjs.evaluate(context.expression);
		} catch (error) {
			if (error instanceof Error) {
				return `Error evaluating expression: ${error.message}`;
			}
			return `Error evaluating expression: ${String(error)}`;
		}
	},
});
