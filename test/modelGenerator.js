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
        let referenceName = typeof reference === 'string' ? reference : reference.modelName;
        let referenceIsArray = false;
        let referenceIsArray = false;
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

module.exports = Generator;
