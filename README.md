# Mongoose lookuper

Mongoose plugin that generate aggregate pipeline for deep lookup by specified fields

## Install

```sh
  npm install --save mongoose-keywords
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
  })

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
