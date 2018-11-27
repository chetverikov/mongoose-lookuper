const mongoose = require('mongoose');
const faker = require('faker');
const {Schema} = mongoose;
const {ObjectId} = Schema.Types;

class Generator {
  constructor() {
    this.modelNames = [];
    this.plugins = [];
  }

  generateModel(name, ...references) {
     const rawSchema = {
      [faker.name.firstName()]: {type: String, default: faker.lorem.words}
    };
    const referenceFields = [];

    if (references) {
      for (const reference of references) {
        let referenceName = getReferenceName(reference);
        const referenceField = `${referenceName}Reference`;

        switch (true) {
          /*
              referenceField: {
                type: ObjectId,
                ref: referenceName
              }
           */
          case typeof reference === 'string':
            referenceName = reference;
            break;

          /*
              referenceField: [
                {
                  type: ObjectId,
                  ref: referenceName
                }
              ]
           */
          case Array.isArray(reference):
            [referenceName] = reference;
            referenceIsArray = true;
            break;

          /*
            referenceField: {
              embeddedField: {
                type: ObjectId,
                ref: referenceName
              }
            }

            referenceField: [
              {
                embeddedField: {
                  type: ObjectId,
                  ref: referenceName
                }
              }
            ]
          */
        }

        referenceFields.push({
          referenceName,
          referenceField
        });

        rawSchema[referenceField] = {
          type: ObjectId,
          ref: referenceName
        };
      }
    }

    const schema = new Schema(rawSchema);

    this.plugins.map(plugin => schema.plugin(plugin));

    schema.statics.getReferenceFields =
      schema.methods.getReferenceFields = () => referenceFields;

    schema.statics.getReferenceField =
      schema.methods.getReferenceField = (index = 0) => referenceFields[index];

    this.modelNames.push(name);

    return mongoose.model(name, schema);
  }

  async generateDocument(Model) {
    const references = Model.getReferenceFields();
    const currentDocument = new Model({});

    if (references) {
      const models = references.map(reference => mongoose.model(reference.referenceName));

      for (const model of models) {
        const document = await this.generateDocument(model);
        currentDocument.set(`${document.constructor.modelName}Reference`, document);
      }
    }

    return currentDocument.save();
  }

  async clear() {
    for (const modelName of this.modelNames) {
      await mongoose.models[modelName].remove({});

      mongoose.deleteModel(modelName);
    }

    this.modelNames = [];
  }
}

/**
 * Return schema for reference
 *
 * @param {String|String[]|Object|Object[]} reference Data for create a reference schema
 */
function getReferenceSchema(reference) {
  if (Array.isArray(reference)) {
    return;
  }

  if (typeof reference === 'string' || reference.modelName) {
    const referenceName = getReferenceName(reference);
    const referenceField = `${referenceName}Reference`;

    return {
      [referenceField]: {
        type: ObjectId,
        ref: referenceName
      }
    }
  }

  if (isPlainObject(reference) && Object.keys(reference).length) {
    const keys = Object.keys(reference);

    for (const key of keys) {
      const embedded = getReferenceSchema(reference[key]);
      const referenceName = getReferenceName(reference);
      const referenceField = `${referenceName}Reference`;

      return {
        [key]: embedded
      }
    }
  }
}

function getReferenceName(v) {
  return typeof v === 'string' ? v : v.modelName
}

function isPlainObject(o) {
  return Boolean(o) && typeof o === 'object' && Object.prototype.toString.call(o) === '[object Object]';
}


module.exports = Generator;
