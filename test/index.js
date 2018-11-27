const assert = require('assert');
const mongoose = require('mongoose');
const ModelGenerator = require('./modelGenerator');
const Lookuper = require('../');

const {Schema} = mongoose;
const {ObjectId} = Schema.Types;

describe('Lookuper', function() {

  this.timeout(5000);

  const modelGenerator = new ModelGenerator();

  before(() => mongoose.connect('mongodb://localhost/lookuper'));

  afterEach(() =>
    modelGenerator.clear()
  );

  describe('#lookup', () => {
    it('should return pipeline for a passed path when path is two level reference', () => {
      const LevelOne = modelGenerator.generate('LevelOne',
        modelGenerator.generate('LevelTwo')
      );

      return documentGenerator(LevelOne)
        .then(() => {
          const lookuper = new Lookuper(LevelOne);
          const pipeline = lookuper.lookup('LevelTwoReference');

          return LevelOne
            .aggregate()
            .match({})
            .append(pipeline)
            .exec();
        })
        .then(result => checkReferencePathDocuments(result[0], LevelOne));
    });

    it('should return pipeline for a passed path when path is three level reference', () => {
      const LevelOne = modelGenerator.generate('LevelOne',
        modelGenerator.generate('LevelTwo',
          modelGenerator.generate('LevelThree')
        )
      );

      return documentGenerator(LevelOne)
        .then(() => {
          const lookuper = new Lookuper(LevelOne);
          const pipeline = lookuper.lookup('LevelTwoReference.LevelThreeReference');

          return LevelOne
            .aggregate()
            .match({})
            .append(pipeline)
            .exec();
        })
        .then(result => checkReferencePathDocuments(result[0], LevelOne));
    });

    it('should return pipeline for a passed path when path is four level reference', () => {
      const LevelOne = modelGenerator.generate('LevelOne',
        modelGenerator.generate('LevelTwo',
          modelGenerator.generate('LevelThree',
            modelGenerator.generate('LevelFour')
          )
        )
      );

      return documentGenerator(LevelOne)
        .then(() => {
          const lookuper = new Lookuper(LevelOne);
          const pipeline = lookuper.lookup('LevelTwoReference.LevelThreeReference.LevelFourReference');

          return LevelOne
            .aggregate()
            .match({})
            .append(pipeline)
            .exec();
        })
        .then(result => checkReferencePathDocuments(result[0], LevelOne));
    });

    it('should return pipeline for a passed path when path is five level reference', () => {
      const LevelOne = modelGenerator.generate('LevelOne',
        modelGenerator.generate('LevelTwo',
          modelGenerator.generate('LevelThree',
            modelGenerator.generate('LevelFour',
              modelGenerator.generate('LevelFive')
            )
          )
        )
      );

      return documentGenerator(LevelOne)
        .then(() => {
          const lookuper = new Lookuper(LevelOne);
          const pipeline = lookuper.lookup('LevelTwoReference.LevelThreeReference.LevelFourReference.LevelFiveReference');

          return LevelOne
            .aggregate()
            .match({})
            .append(pipeline)
            .exec();
        })
        .then(result => checkReferencePathDocuments(result[0], LevelOne));
    });

    it('should return pipeline for the passed paths when paths are five level reference', () => {
      const LevelOne = modelGenerator.generate('RootLevelOne',
        modelGenerator.generate('ThreadOneLevelTwo',
          modelGenerator.generate('ThreadOneLevelThree',
            modelGenerator.generate('ThreadOneLevelFour',
              modelGenerator.generate('ThreadOneLevelFive')
            )
          )
        ),
        modelGenerator.generate('ThreadTwoLevelTwo',
          modelGenerator.generate('ThreadTwoLevelThree',
            modelGenerator.generate('ThreadTwoLevelFour',
              modelGenerator.generate('ThreadTwoLevelFive')
            )
          )
        )
      );

      return documentGenerator(LevelOne)
        .then(() => {
          const lookuper = new Lookuper(LevelOne);
          const pipeline = lookuper.lookup([
            'ThreadOneLevelTwoReference.ThreadOneLevelThreeReference.ThreadOneLevelFourReference.ThreadOneLevelFiveReference',
            'ThreadTwoLevelTwoReference.ThreadTwoLevelThreeReference.ThreadTwoLevelFourReference.ThreadTwoLevelFiveReference'
          ]);

          return LevelOne
            .aggregate()
            .match({})
            .append(pipeline)
            .exec();
        })
        .then(result => checkReferencePathDocuments(result[0], LevelOne));
    });

    it('should ignore a duplicate path for lookup', () => {
      const LevelOne = modelGenerator.generate('RootLevelOne',
        modelGenerator.generate('ThreadOneLevelTwo',
          modelGenerator.generate('ThreadOneLevelThree',
            modelGenerator.generate('ThreadOneLevelFour')
          )
        )
      );

      const lookuper = new Lookuper(LevelOne);
      const pipeline = lookuper.lookup([
        'ThreadOneLevelTwoReference.ThreadOneLevelThreeReference',
        'ThreadOneLevelTwoReference',
        'ThreadOneLevelTwoReference.ThreadOneLevelThreeReference',
        'ThreadOneLevelTwoReference.ThreadOneLevelThreeReference.ThreadOneLevelFourReference'
      ]);

      assert.equal(pipeline.length, 6);
      assert.equal(pipeline[0].$lookup.localField, 'ThreadOneLevelTwoReference');
      assert.equal(pipeline[2].$lookup.localField, 'ThreadOneLevelTwoReference.ThreadOneLevelThreeReference');
      assert.equal(pipeline[4].$lookup.localField, 'ThreadOneLevelTwoReference.ThreadOneLevelThreeReference.ThreadOneLevelFourReference');
    });

    it('should ignore a _id path', () => {
      const LevelOne = mongoose.model('LevelOne', {});

      const lookuper = new Lookuper(LevelOne);
      const pipeline = lookuper.lookup('_id');

      modelGenerator.modelNames.push('LevelOne');

      assert.equal(pipeline.length, 0);
    });

    describe('array references', () => {
      it('should return pipeline for array path with embedded docs', async () => {
        const ArrayLevelOne = mongoose.model('LevelOneWithArray', {
          levelTwo: [{
            someField: {
              type: ObjectId,
              ref: 'LevelTwo'
            }
          }]
        });
        const ArrayLevelTwo = mongoose.model('LevelTwo', {});

        modelGenerator.modelNames.push('LevelOneWithArray', 'LevelTwo');

        const levelTwoDocs = [
          await ArrayLevelTwo.create({}),
          await ArrayLevelTwo.create({}),
          await ArrayLevelTwo.create({})
        ];
        await ArrayLevelOne.create({levelTwo: levelTwoDocs.map(doc => ({someField: doc._id}))});

        const lookuper = new Lookuper(ArrayLevelOne);

        const pipeline = lookuper.lookup('levelTwo.someField');

        const lookupedDocs = await ArrayLevelOne
          .aggregate()
          .match({})
          .append(pipeline)
          .exec();

        assert.equal(lookupedDocs.length, 1);
        assert.equal(lookupedDocs[0].levelTwo.length, 3);

        for (const embedded of lookupedDocs[0].levelTwo) {
          assert.equal(typeof embedded.someField, 'object');
          assert.ok(embedded.someField._id);
        }
      });

      it('should return pipeline for array path with ObjectIDs', async () => {
        const ArrayLevelOne = mongoose.model('LevelOneWithArray', {
          levelTwo: [{
            type: ObjectId,
            ref: 'LevelTwo'
          }]
        });
        const ArrayLevelTwo = mongoose.model('LevelTwo', {});

        modelGenerator.modelNames.push('LevelOneWithArray', 'LevelTwo');

        const levelTwoDocs = [
          await ArrayLevelTwo.create({}),
          await ArrayLevelTwo.create({}),
          await ArrayLevelTwo.create({})
        ];
        await ArrayLevelOne.create({levelTwo: levelTwoDocs.map(doc => doc._id)});

        const lookuper = new Lookuper(ArrayLevelOne);

        const pipeline = lookuper.lookup('levelTwo');

        const lookupedDocs = await ArrayLevelOne
          .aggregate()
          .match({})
          .append(pipeline)
          .exec();

        assert.equal(lookupedDocs.length, 1);
        assert.equal(lookupedDocs[0].levelTwo.length, 3);

        for (const embedded of lookupedDocs[0].levelTwo) {
          assert.equal(typeof embedded, 'object');
          assert.ok(embedded._id);
        }
      });
    });
  });

  describe('#options', () => {
    it('should lookup documents by custom field when set a "foreignField" option', () => {
      const LevelOne = mongoose.model('LevelOne', {LevelTwoReference: {type: ObjectId, ref: 'LevelTwo'}});
      const LevelTwo = mongoose.model('LevelTwo', {foo: ObjectId});
      const foo = new mongoose.Types.ObjectId();

      modelGenerator.modelNames.push('LevelOne', 'LevelTwo');

      return LevelTwo
        .create({foo})
        .then(() => LevelOne.create({LevelTwoReference: foo}))
        .then(() => {
          const lookuper = new Lookuper(LevelOne, {foreignField: 'foo'});
          const pipeline = lookuper.lookup('LevelTwoReference');

          return LevelOne
            .aggregate()
            .match({})
            .append(pipeline)
            .exec();
        })
        .then(result => assert.equal(result[0].LevelTwoReference.foo.toString(), foo.toString()));
    });

    it('should return documents without lookuped documents when set a "preserveNullAndEmptyArrays" option', () => {
      const LevelOne = modelGenerator.generate('LevelOne',
        modelGenerator.generate('LevelTwo')
      );

      return documentGenerator(LevelOne)
        .then(() => LevelOne.create({}))
        .then(() => {
          const lookuper = new Lookuper(LevelOne, {preserveNullAndEmptyArrays: false});
          const pipeline = lookuper.lookup('LevelTwoReference');

          return LevelOne
            .aggregate()
            .match({})
            .append(pipeline)
            .exec();
        })
        .then(result => {
          assert.equal(result.length, 1);
          assert.ok(result[0].LevelTwoReference._id);
        });
    });

    it('should return all documents when set a "preserveNullAndEmptyArrays" option as true', () => {
      const LevelOne = modelGenerator.generate('LevelOne',
        modelGenerator.generate('LevelTwo')
      );

      return documentGenerator(LevelOne)
        .then(() => LevelOne.create({}))
        .then(() => {
          const lookuper = new Lookuper(LevelOne, {preserveNullAndEmptyArrays: true});
          const pipeline = lookuper.lookup('LevelTwoReference');

          return LevelOne
            .aggregate()
            .match({})
            .append(pipeline)
            .exec();
        })
        .then(result => {
          assert.equal(result.length, 2);
          assert.ok(result[0].LevelTwoReference._id);
          assert.equal(result[1].LevelTwoReference, undefined);
        });
    });
  });

  function checkReferencePathDocuments(topLevelDocument, Model) {
    const references = Model.getReferenceFields();

    references.forEach(reference => {
      const referenceDocument = topLevelDocument[reference.referenceField];
      assert.ok(
        typeof referenceDocument === "object" && referenceDocument !== null,
        `Not found reference document in ${Model.modelName}#${reference.referenceField}`
      );

      checkReferencePathDocuments(topLevelDocument[reference.referenceField], mongoose.model(reference.referenceName));
    });
  }
});

async function documentGenerator(Model) {
  const references = Model.getReferenceFields();
  const currentDocument = new Model({});

  if (references) {
    const models = references.map(reference => mongoose.model(reference.referenceName));

    for (const model of models) {
      const document = await documentGenerator(model);
      currentDocument.set(`${document.constructor.modelName}Reference`, document);
    }
  }

  return currentDocument.save();
}