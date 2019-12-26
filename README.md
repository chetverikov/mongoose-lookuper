# Mongoose lookuper

Mongoose plugin that generate aggregate pipeline for deep lookup by specified fields

## Install

```sh
  npm install --save mongoose-lookuper
```

## Usage

```javascript
  const mongoose = require('mongoose');
  const lookuper = require('mongoose-lookuper');

  const {ObjectId} = mongoose;

  // create models
  mongoose.model('LevelThree', {
    someField: String
  });

  mongoose.model('LevelTwo', {
    fieldInLevelTwo: Number,
    levelThree: {
      ref: 'LevelThree',
      type: ObjectId
    }
  });

  const LevelOneModel = mongoose.model('LevelOne', {
    title: String,
    embeddedObj: {
      embeddedTitle: String,
      embeddedField: {
        levelTwos: [{
          ref: 'LevelTwo',
          type: ObjectId
        }]
      }
    }
  });

  const pipeline = lookuper.getPipeline(LevelOneModel, 'embeddedObj.embeddedField.levelTwos.levelThree');
  const docs = await LevelOneModel.aggregate(pipeline); // docs with lookuped fields
```

The variable 'docs' contains documents with lookuped fields:

```json
[
  {
    "_id": "5e04a8d9d9bae70a75fb5377",
    "embeddedObj": {
      "embeddedField": {
        "levelTwos": [
          {
            "_id": "5e04a8d9d9bae70a75fb5379",
            "levelTwo": {
              "_id": "5e04a8d9d9bae70a75fb5373",
              "levelThree": {
                "_id": "5e04a8d9d9bae70a75fb5372",
                "levelFour": {
                  "_id": "5e04a8d9d9bae70a75fb5371",
                  "someField": "aspernatur et fugiat",
                  "__v": 0
                },
                "someField": "sit ad dolorem",
                "__v": 0
              },
              "fieldInLevelTwo": "ipsam eum reiciendis",
              "__v": 0
            },
            "lostField": "soluta dicta deserunt"
          },
          {
            "_id": "5e04a8d9d9bae70a75fb5378",
            "levelTwo": {
              "_id": "5e04a8d9d9bae70a75fb5376",
              "levelThree": {
                "_id": "5e04a8d9d9bae70a75fb5375",
                "levelFour": {
                  "_id": "5e04a8d9d9bae70a75fb5374",
                  "someField": "expedita ex aperiam",
                  "__v": 0
                },
                "someField": "placeat ratione facilis",
                "__v": 0
              },
              "fieldInLevelTwo": "beatae iste aspernatur",
              "__v": 0
            },
            "lostField": "et voluptas ipsa"
          }
        ]
      },
      "embeddedTitle": "quam doloribus corporis"
    },
    "title": "minus et amet",
    "__v": 0
  }
]
```
