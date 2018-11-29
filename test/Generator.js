const mongoose = require('mongoose');
const faker = require('faker');
const {Schema} = mongoose;
const {ObjectId} = Schema.Types;

/**
 * Example:
 *
 *   const generator = new Generator();
 *
 *   const model = generator.generateModel('Fuck', {
 *     field: generator.generateModel('Field'),
 *     arrOfObjects: [{
 *       a: generator.generateModel('Aa'),
 *       b: generator.generateModel('Bb')
 *     }],
 *     arr: [generator.generateModel('Arr')]
 *   });
 *
 *   const doc = await generator.generateDocument(model);
 */

class Generator {
  constructor() {
    this.modelNames = [];
    this.plugins = [];
  }

  generateModel(name, ...references) {
    const rawSchema = {
      [faker.name.firstName()]: {type: String, default: faker.lorem.words}
    };

    if (references && references.length) {
      for (const reference of references) {
        Object.assign(rawSchema, getReferenceData(reference));
      }
    }

    const referencePaths = getReferencePaths(rawSchema);
    const schema = new Schema(rawSchema);

    this.plugins.map(plugin => schema.plugin(plugin));

    schema.statics.getReferencePaths =
      schema.methods.getReferencePaths = () => referencePaths;

    this.modelNames.push(name);

    return mongoose.model(name, schema);
  }

  async generateDocument(Model) {
    const references = Model.getReferencePaths();
    const currentDocument = new Model({});

    if (references) {
      const prepared = await this.prepareReferences(references);

      currentDocument.set(prepared);
    }

    return currentDocument.save();
  }

  async prepareReferences(references = {}) {
    const sets = {};

    if (references.type && references.ref) {
      const model = mongoose.model(references.ref);

      return this.generateDocument(model);
    }

    for (const [path, data] of Object.entries(references)) {
      if (typeof data === 'string') {
        const model = mongoose.model(data);
        const document = await this.generateDocument(model);

        Object.assign(sets, {[path]: document});
      }

      if (Array.isArray(data) && data.length) {
        const result = [];

        for (const item of data) {
          result.push(await this.prepareReferences(item))
        }

        Object.assign(sets, {[path]: result})
      }
    }

    return sets;
  }

  async clear() {
    for (const modelName of this.modelNames) {
      await mongoose.models[modelName].remove({});

      mongoose.deleteModel(modelName);
    }

    this.modelNames = [];
  }
}

function getReferencePaths(schema) {
  const paths = {};

  if (schema.type && schema.ref) {
    return schema;
  }

  for (const [path, data] of Object.entries(schema)) {
    if (data.type && data.ref) {
      paths[path] = data.ref;
    }

    if (isPlainObject(data) && !data.type) {
      const embedded = getReferencePaths(data);

      for (const [embeddedPath, embeddedData] of Object.entries(embedded)) {
        paths[`${path}.${embeddedPath}`] = embeddedData;
      }
    }

    if (Array.isArray(data) && data.length) {
      paths[path] = data.map(getReferencePaths);
    }
  }

  return paths;
}

/**
 * Return schema for reference
 *
 * @param {String|String[]|Object|Object[]} reference Data for create a reference schema
 * @param {Boolean} withoutRefField Set true if reference field do not need
 * @return {Array|Object|Array}
 */
function getReferenceData(reference, withoutRefField = false) {
  if (Array.isArray(reference)) {
    return reference.map(item => getReferenceData(item, true));
  }

  if (typeof reference === 'string' || reference.modelName) {
    const referenceName = getReferenceName(reference);
    const referenceField = `${referenceName}Reference`;
    const schema = {
      type: ObjectId,
      ref: referenceName
    };

    if (withoutRefField) {
      return schema;
    }

    return {
      [referenceField]: schema
    }
  }

  if (isPlainObject(reference) && Object.keys(reference).length) {
    const keys = Object.keys(reference);
    const schema = {};

    for (const key of keys) {
      schema[key] = getReferenceData(reference[key], true);
    }

    return schema;
  }
}

function getReferenceName(v) {
  return typeof v === 'string' ? v : v.modelName
}

function isPlainObject(o) {
  return Boolean(o) && typeof o === 'object' && Object.prototype.toString.call(o) === '[object Object]';
}

module.exports = Generator;
