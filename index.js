const mongoose = require('mongoose');
const defaultOptions = {
  foreignField: '_id',
  preserveNullAndEmptyArrays: true,
  referencePathPrefix: '',
  parentArrayReference: '',
  excludePaths: []
};

/**
 * Lookuper
 *
 * Lookuper generate pipeline for deep lookup by passed path(s)
 *
 * Example:
 *
 *   const pipeline = lookuper.getPipeline('field.innerReference.fieldOfRef.secInnerRef.foo.bar');
 *
 *   myAggregateQueryCursor.append(pipeline);
 *   myAggregateQueryCursor.exec();
 *
 * Result of pipeline work:
 *   {
 *     field: {
 *       innerReference: { // lookuped field
 *         _id: ObjectId(""),
 *         fieldOfRef: {
 *           secInnerRef: { // lookuped field
 *             _id: ObjectId(""),
 *             foo: {
 *               bar: 'Yeeeehaaaa'
 *             }
 *           }
 *         }
 *       }
 *     }
 *   }
 *
 */


/**
 * Return data of a nearest reference descriptor by passed path
 *
 * @param {Schema|Model} model Model or Schema
 * @param {String} path Path will be searched for reference
 *
 * @return {{referencePath: String, referenceCollectionName: String, referenceModel: Model}} Nearest reference descriptor
 */
function getNearestReferenceData(model, path) {
  const schema = getSchema(model);
  const parts = path.split('.');

  let schemaType = schema.path(path);
  let referencePath = [];

  if (parts.length === 0 || (parts.length === 1 && isUnnecessaryPath(schemaType))) {
    return null;
  }

  if (schemaType) {
    referencePath = parts;
  }

  while (isUnnecessaryPath(schemaType) && parts.length > 0) {
    referencePath.push(parts.shift());
    schemaType = schema.path(referencePath.join('.'));

    if (isArrayPath(schemaType)) {
      break;
    }
  }

  if (!schemaType) {
    return null;
  }

  if (isReferencePath(schemaType)) {
    const referenceModel = mongoose.model(schemaType.options.ref);
    const referenceCollectionName = referenceModel.collection.collectionName;

    return {
      referencePath: referencePath.join('.'),
      referenceCollectionName,
      referenceModel
    };
  }

  if (isArrayPath(schemaType)) {
    let data = {};

    if (isArrayOfDocumentsPath(schemaType)) {
      Object.assign(data, getNearestReferenceData(schemaType.schema, parts.join('.')));

      data.isArray = true;
      data.isArrayOfDocuments = true;
      data.arrayField = referencePath.join('.');
      data.referenceField = data.referencePath;
      data.referencePath = [...referencePath, data.referencePath].join('.');
    } else {
      const referenceModel = mongoose.model(schemaType.caster.options.ref);
      const referenceCollectionName = referenceModel.collection.collectionName;

      data.isArray = true;
      data.referencePath = referencePath.join('.');
      data.referenceCollectionName = referenceCollectionName;
      data.referenceModel = referenceModel;
    }

    return data;
  }
}

/**
 * Return pipeline
 *
 * This method generate pipeline with $lookup for any fields that are reference in the given path.
 *
 * @param {Schema|Model} model Model or Schema
 * @param {String|String[]} path The path for which you want to perform "$lookup" (ex. catalog.author.name)
 * @param {Object} [options] Options for lookuper's instance
 * @param {String} [options.foreignField] Value of field from pipeline lookup (https://docs.mongodb.com/manual/reference/operator/aggregation/lookup/)
 * @param {Boolean} [options.preserveNullAndEmptyArrays] Unwind pipeline field (https://docs.mongodb.com/manual/reference/operator/aggregation/unwind/)
 * @param {String} [options.referencePathPrefix] Option use then need to lookup field in already lookup field
 * @param {String[]} [options.excludePaths] Exclude paths
 * @param {Boolean} [options.parentArrayReference] When parent path is array
 *
 * @return {Array} Pipeline for inject into your Aggregate Query
 */
function getPipeline(model, path, options = {}) {
  options = {...defaultOptions, ...options};

  if (Array.isArray(path)) {
    const pipeline = [];
    const excludePaths = [...(options.excludePaths || [])];

    for (const tmp of path) {
      const result = getPipeline(model, tmp, {
        ...options,
        excludePaths
      });

      excludePaths.push(...getExcludePathsFromPipeline(result));
      pipeline.push(...result);
    }

    return pipeline;
  }

  const schema = getSchema(model);
  const nearestReference = getNearestReferenceData(schema, path);
  const excludePaths = [...(options.excludePaths || [])];
  const pipelines = [];

  if (!nearestReference) {
    return pipelines;
  }

  const pipelinePath = `${options.referencePathPrefix}${nearestReference.referencePath}`;

  if (options.parentArrayReference) {
    nearestReference.isArray = true;
    nearestReference.isArrayOfDocuments = true;
    nearestReference.arrayField = options.parentArrayReference;
    nearestReference.referenceField = nearestReference.referencePath;
  }

  if (!excludePaths.includes(pipelinePath)) {
    const fieldFoundDocs = nearestReference.isArrayOfDocuments ? `tmp_${pipelinePath}` : pipelinePath;

    pipelines.push(
      {
        $lookup: {
          from: nearestReference.referenceCollectionName,
          localField: pipelinePath,
          foreignField: options.foreignField,
          as: fieldFoundDocs
        }
      }
    );

    excludePaths.push(pipelinePath);

    if (!nearestReference.isArray) {
      pipelines.push(getUnwindStage(pipelinePath, options.preserveNullAndEmptyArrays));
    } else {
      if (nearestReference.isArrayOfDocuments) {
        const {arrayField} = nearestReference;
        const referenceField = pipelinePath.replace(`${arrayField}.`, '');

        pipelines.push(getAddFieldsStage(arrayField, referenceField, fieldFoundDocs));
        pipelines.push({$addFields: {[`tmp_${arrayField}`]: '$$REMOVE'}});
      }
    }
  }

  if (path !== nearestReference.referencePath) {
    const parentArrayReference = nearestReference.isArray && !options.parentArrayReference ?
      nearestReference.referencePath
      :
      options.parentArrayReference;
    const deepPath = path.replace(`${nearestReference.referencePath}.`, '');
    const pipeline = getPipeline(nearestReference.referenceModel, deepPath, {
      referencePathPrefix: `${options.referencePathPrefix}${nearestReference.referencePath}.`,
      excludePaths: [...excludePaths, pipelinePath],
      parentArrayReference
    });

    pipelines.push(...pipeline);
  }

  return pipelines;
}

/**
 * Return $unwind stage
 *
 * @param {String} path Unwind path
 * @param {Boolean} [preserveNullAndEmptyArrays] https://docs.mongodb.com/manual/reference/operator/aggregation/unwind/
 *
 * @returns {{$unwind: {path: string, preserveNullAndEmptyArrays: boolean}}}
 */
function getUnwindStage(path, preserveNullAndEmptyArrays) {
  return {
    $unwind: {
      path: `$${path}`,
      preserveNullAndEmptyArrays
    }
  };
}

/**
 * Return $addField stage
 *
 * @param {String} baseField Base field
 * @param {String} referenceField The field that will be filled
 * @param {String} fieldFoundDocs The field that contain found document
 *
 * @returns {{$addFields: {}}}
 */
function getAddFieldsStage(baseField, referenceField, fieldFoundDocs) {
  const mergeObject = {};
  const arrayElemAt = {
    '$arrayElemAt': [
      `$${fieldFoundDocs}`,
      {$indexOfArray: [`$${fieldFoundDocs}._id`, `$$this.${referenceField}`]}
    ]
  };

  if (referenceField.includes('.')) {
    const parts = referenceField.split('.');
    let lastObject = mergeObject;

    while (parts.length > 1) {
      const part = parts.shift();

      lastObject[part] = {};
      lastObject = lastObject[part];
    }

    referenceField = parts.shift();
    lastObject[referenceField] = arrayElemAt;
  } else {
    mergeObject[referenceField] = arrayElemAt;
  }

  return {
    $addFields: {
      [baseField]: {
        $map: {
          input: `$${baseField}`,
          in: {
            $mergeObjects: ['$$this', mergeObject]
          }
        }
      }
    }
  }
}

function getExcludePathsFromPipeline(pipeline) {
  const excludePaths = [];

  for (const stage of pipeline) {
    if (stage && stage.$lookup) {
      excludePaths.push(stage.$lookup.localField);
    }
  }

  return excludePaths;
}

function getSchema(modelOrSchema) {
  return modelOrSchema.schema ? modelOrSchema.schema : modelOrSchema;
}

function isUnnecessaryPath(schemaType) {
  return !isObjectIdPath(schemaType) && !isArrayPath(schemaType);
}

function isObjectIdPath(schemaType) {
  return schemaType && schemaType.instance === 'ObjectID';
}

function isArrayPath(schemaType) {
  return schemaType && (schemaType.$isMongooseArray || isArrayOfDocumentsPath(schemaType));
}

function isArrayOfDocumentsPath(schemaType) {
  return schemaType && schemaType.$isMongooseDocumentArray;
}

function isReferencePath(schemaType) {
  return schemaType && schemaType.options && schemaType.options.ref
}

module.exports = {
  getNearestReferenceData,
  getPipeline
};
