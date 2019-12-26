const mongoose = require('mongoose');
const faker = require('faker');
const lookuper = require('../');

const {ObjectId} = mongoose;
const stringFieldSchema = {type: String, default: faker.lorem.words};

(async function() {
  try {
    await mongoose.connect('mongodb://localhost:27017/lookuper', {useNewUrlParser: true});

    // create models
    const LevelFourModel = mongoose.model('LevelFour', {
      someField: stringFieldSchema
    });

    const LevelThreeModel = mongoose.model('LevelThree', {
      someField: stringFieldSchema,
      levelFour: {
        ref: 'LevelFour',
        type: ObjectId
      }
    });

    const LevelTwoModel = mongoose.model('LevelTwo', {
      fieldInLevelTwo: stringFieldSchema,
      levelThree: {
        ref: 'LevelThree',
        type: ObjectId
      }
    });

    const LevelOneModel = mongoose.model('LevelOne', {
      title: stringFieldSchema,
      embeddedObj: {
        embeddedTitle: stringFieldSchema,
        embeddedField: {
          levelTwos: [{
            lostField: stringFieldSchema,
            levelTwo: {
              ref: 'LevelTwo',
              type: ObjectId
            }
          }]
        }
      }
    });

    await LevelOneModel.deleteMany({});

    let count = 100;

    while (count--) {
      await LevelOneModel.create({
        embeddedObj: {
          embeddedField: {
            levelTwos: [
              {
                levelTwo: await LevelTwoModel.create({
                  levelThree: await LevelThreeModel.create({
                    levelFour: await LevelFourModel.create({})
                  })
                })
              },
              {
                levelTwo: await LevelTwoModel.create({
                  levelThree: await LevelThreeModel.create({
                    levelFour: await LevelFourModel.create({})
                  })
                })
              }
            ]
          }
        }
      });

      if (count % 1000 === 0) {
        console.log(count);
      }
    }

    const pipeline = lookuper.getPipeline(LevelOneModel, 'embeddedObj.embeddedField.levelTwos.levelTwo.levelThree.levelFour');
    const docs = await LevelOneModel.aggregate(pipeline); // docs with lookuped fields

    console.log(JSON.stringify(docs, null, 2));
  } catch (err) {
    console.log(err);
  } finally {
    await mongoose.disconnect();
  }
})();
