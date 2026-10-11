import Ajv2020 from "ajv/dist/2020.js";

const compiledSchemas = new Map();
const maximumCompiledSchemas = 8;

// Callers reread schema bytes and validate each input. Only compilation is reused.
export function compileClosedSchema(schemaText) {
  let validate = compiledSchemas.get(schemaText);
  if (!validate) {
    validate = new Ajv2020({ allErrors: true, strict: true }).compile(JSON.parse(schemaText));
    compiledSchemas.set(schemaText, validate);
    if (compiledSchemas.size > maximumCompiledSchemas) {
      compiledSchemas.delete(compiledSchemas.keys().next().value);
    }
  }
  return validate;
}
