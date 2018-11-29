const assert = require('assert');
const mongoose = require('mongoose');
const get = require('lodash.get');
const Generator = require('./Generator');
const Lookuper = require('../');

const {Schema} = mongoose;
const {ObjectId} = Schema.Types;

describe('Lookuper', function() {

  this.timeout(5000);

  const generator = new Generator();

  before(() => mongoose.connect('mongodb://localhost/lookuper'));
  after(() => mongoose.disconnect());

  afterEach(() => generator.clear());

  describe('#lookup', () => {
    it('should return pipeline for a passed path when path is two level reference', async () => {
      const LevelOne = generator.generateModel('LevelOne',
        generator.generateModel('LevelTwo')
      );

      await generator.generateDocument(LevelOne);

      const lookuper = new Lookuper(LevelOne);
      const pipeline = lookuper.lookup('LevelTwoReference');

      const result = await LevelOne
        .aggregate()
        .match({})
        .append(pipeline)
        .exec();

      checkReferencePathDocuments(result[0], LevelOne);
    });

    it('should return pipeline for a passed path when path is three level reference', async () => {
      const LevelOne = generator.generateModel('LevelOne',
        generator.generateModel('LevelTwo',
          generator.generateModel('LevelThree')
        )
      );

      await generator.generateDocument(LevelOne);

      const lookuper = new Lookuper(LevelOne);
      const pipeline = lookuper.lookup('LevelTwoReference.LevelThreeReference');

      const result = await LevelOne
        .aggregate()
        .match({})
        .append(pipeline)
        .exec();

      checkReferencePathDocuments(result[0], LevelOne);
    });

    it('should return pipeline for a passed path when path is four level reference', async () => {
      const LevelOne = generator.generateModel('LevelOne',
        generator.generateModel('LevelTwo',
          generator.generateModel('LevelThree',
            generator.generateModel('LevelFour')
          )
        )
      );

      await generator.generateDocument(LevelOne);

      const lookuper = new Lookuper(LevelOne);
      const pipeline = lookuper.lookup('LevelTwoReference.LevelThreeReference.LevelFourReference');

      const result = await LevelOne
        .aggregate()
        .match({})
        .append(pipeline)
        .exec();

      checkReferencePathDocuments(result[0], LevelOne);
    });

    it('should return pipeline for a passed path when path is five level reference', async () => {
      const LevelOne = generator.generateModel('LevelOne',
        generator.generateModel('LevelTwo',
          generator.generateModel('LevelThree',
            generator.generateModel('LevelFour',
              generator.generateModel('LevelFive')
            )
          )
        )
      );

      await generator.generateDocument(LevelOne);

      const lookuper = new Lookuper(LevelOne);
      const pipeline = lookuper.lookup('LevelTwoReference.LevelThreeReference.LevelFourReference.LevelFiveReference');

      const result = await LevelOne
        .aggregate()
        .match({})
        .append(pipeline)
        .exec();

      checkReferencePathDocuments(result[0], LevelOne);
    });

    it('should return pipeline for the passed paths when paths are five level reference', async () => {
      const LevelOne = generator.generateModel('RootLevelOne',
        generator.generateModel('ThreadOneLevelTwo',
          generator.generateModel('ThreadOneLevelThree',
            generator.generateModel('ThreadOneLevelFour',
              generator.generateModel('ThreadOneLevelFive')
            )
          )
        ),
        generator.generateModel('ThreadTwoLevelTwo',
          generator.generateModel('ThreadTwoLevelThree',
            generator.generateModel('ThreadTwoLevelFour',
              generator.generateModel('ThreadTwoLevelFive')
            )
          )
        )
      );

      await generator.generateDocument(LevelOne);

      const lookuper = new Lookuper(LevelOne);
      const pipeline = lookuper.lookup([
        'ThreadOneLevelTwoReference.ThreadOneLevelThreeReference.ThreadOneLevelFourReference.ThreadOneLevelFiveReference',
        'ThreadTwoLevelTwoReference.ThreadTwoLevelThreeReference.ThreadTwoLevelFourReference.ThreadTwoLevelFiveReference'
      ]);

      const result = await LevelOne
        .aggregate()
        .match({})
        .append(pipeline)
        .exec();

      checkReferencePathDocuments(result[0], LevelOne);
    });

    it('should ignore a duplicate path for lookup', () => {
      const LevelOne = generator.generateModel('RootLevelOne',
        generator.generateModel('ThreadOneLevelTwo',
          generator.generateModel('ThreadOneLevelThree',
            generator.generateModel('ThreadOneLevelFour')
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

      generator.modelNames.push('LevelOne');

      assert.equal(pipeline.length, 0);
    });

    describe('array references', () => {
      it('should return pipeline for array path with embedded docs', async () => {
        const LevelOne = generator.generateModel('LevelOne',
          {
            levelTwo: [
              {someField: generator.generateModel('LevelTwo')}
            ]
          }
        );

        await generator.generateDocument(LevelOne);

        const lookuper = new Lookuper(LevelOne);
        const pipeline = lookuper.lookup('levelTwo.someField');

        const lookupedDocs = await LevelOne
          .aggregate()
          .match({})
          .append(pipeline)
          .exec();

        assert.equal(lookupedDocs.length, 1);
        assert.equal(lookupedDocs[0].levelTwo.length, 1);

        for (const embedded of lookupedDocs[0].levelTwo) {
          assert.equal(typeof embedded.someField, 'object');
          assert.ok(embedded.someField._id);
        }
      });

      it('should return pipeline for array path with ObjectIDs', async () => {
        const LevelOne = generator.generateModel('LevelOneWithArray', {
          levelTwo: [generator.generateModel('LevelTwo')]
        });

        await generator.generateDocument(LevelOne);

        const lookuper = new Lookuper(LevelOne);
        const pipeline = lookuper.lookup('levelTwo');

        const lookupedDocs = await LevelOne
          .aggregate()
          .match({})
          .append(pipeline)
          .exec();

        assert.equal(lookupedDocs.length, 1);
        assert.equal(lookupedDocs[0].levelTwo.length, 1);

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

      generator.modelNames.push('LevelOne', 'LevelTwo');

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
      const LevelOne = generator.generateModel('LevelOne',
        generator.generateModel('LevelTwo')
      );

      return generator.generateDocument(LevelOne)
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
      const LevelOne = generator.generateModel('LevelOne',
        generator.generateModel('LevelTwo')
      );

      return generator.generateDocument(LevelOne)
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
    const references = Model.getReferencePaths();

    for (const [path, modelName] of Object.entries(references)) {
      const refDoc = get(topLevelDocument, path);

      assert.ok(
        typeof refDoc === "object" && refDoc !== null,
        `Not found reference document in ${modelName}#${path}`
      );

      checkReferencePathDocuments(refDoc, mongoose.model(modelName));
    }
  }
});