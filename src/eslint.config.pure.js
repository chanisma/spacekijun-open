
import js from "@eslint/js";
import globals from "globals";

export default [
    js.configs.recommended,
    {
        files: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
        },
        rules: {
            "no-unused-vars": "warn"
        }
    }
];
