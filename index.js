const mongoose = require('mongoose');

/**
 * Lookuper
 *
 * Class generation pipeline for deep lookup by passed path(s)
 *
 * Example:
 *
 *   const lookuper = new Lookuper(MyModel)
 *   const pipeline = lookuper.lookup('field.innerReference.fieldOfRef.secInnerRef.foo.bar');
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
class Lookuper {

  /**
   * Constructor
   *
   * @param {Model|Schema} modelOrSchema Current model or schema
   * @param {Object} [options] Options for lookuper's instance
   * @param {String} [options.foreignField] Value of field from pipeline lookup (https://docs.mongodb.com/manual/reference/operator/aggregation/lookup/)
   * @param {Boolean} [options.preserveNullAndEmptyArrays] Unwind pipline field (https://docs.mongodb.com/manual/reference/operator/aggregation/unwind/)
   * @param {String} [options.referencePathPrefix] Option use then need to loolup field in already lookup field
   */
  constructor(modelOrSchema, options) {
    this._schema = modelOrSchema.schema ? modelOrSchema.schema : modelOrSchema;
    this._options = {
      foreignField: '_id',
      preserveNullAndEmptyArrays: true,
      referencePathPrefix: '',
      excludePaths: []
    };

    if (typeof options === 'object' && options !== null) {
      Object.assign(this._options, options);
    }

  }

  /**
   * Return a nearest reference descriptor by passed path
   *
   * @param {String} path Path will be searched for reference
   * @return {{referencePath: String, referenceCollectionName: String, referenceModel: Model}} Nearest reference descriptor
   */
  getNearestReference(path) {
    const parts = path.split('.');
    let pathDescriptor = this._schema.path(path);
    let referencePath = [];

    if (parts.length === 0 || (parts.length === 1 && isUnnecessaryPath(pathDescriptor))) {
      return null;
    }

    if (pathDescriptor) {
      referencePath = parts;
    }

    while (isUnnecessaryPath(pathDescriptor) && parts.length > 0) {
      referencePath.push(parts.shift());
      pathDescriptor = this._schema.path(referencePath.join('.'));

      if (isArrayPath(pathDescriptor)) {
        break;
      }
    }

    if (!pathDescriptor) {
      return null;
    }

    if (pathDescriptor.options.ref) {
      const referenceModel = mongoose.model(pathDescriptor.options.ref);
      const referenceCollectionName = referenceModel.collection.collectionName;

      return {
        isArray: false,
        referencePath: referencePath.join('.'),
        referenceCollectionName,
        referenceModel
      };
    }

    if (isArrayPath(pathDescriptor)) {
      let data = {
        isArray: true
      };

      if (isArrayOfDocumentsPath(pathDescriptor)) {
        const lookuper = new Lookuper(pathDescriptor.schema, {
          referencePathPrefix: referencePath.join('.')
        });

        data = {...data, ...lookuper.getNearestReference(parts.join('.'))};
        data.isArrayOfDocuments = true;
        data.field = referencePath.join('.');
        data.referenceField = data.referencePath;
        data.referencePath = [referencePath, data.referencePath].join('.');
      } else {
        const referenceModel = mongoose.model(pathDescriptor.caster.options.ref);
        const referenceCollectionName = referenceModel.collection.collectionName;

        data.referencePath = referencePath.join('.');
        data.referenceCollectionName = referenceCollectionName;
        data.referenceModel = referenceModel;
      }

      return data;
    }
  }

  /**
   * Lookup
   *
   * This method exec "$lookup" pipeline for any fields that are reference in the given path.
   *
   * @param {String|String[]} path The path for which you want to perform "$lookup" (ex. catalog.author.name)
   * @return {Array} Pipeline for inject into your Aggregate Query
   */
  lookup(path) {
    if (Array.isArray(path)) {
      return path.reduce((pipeline, path) => {
        return pipeline.concat(this.lookup(path));
      }, []);
    }

    const nearestReference = this.getNearestReference(path);
    let pipelines = [];

    if (!nearestReference) {
      return pipelines;
    }

    const pipelinePath = `${this._options.referencePathPrefix}${nearestReference.referencePath}`;

    if (!this._options.excludePaths.includes(pipelinePath)) {
      pipelines = [
        {
          $lookup: {
            from: nearestReference.referenceCollectionName,
            localField: pipelinePath,
            foreignField: this._options.foreignField,
            as: nearestReference.isArrayOfDocuments ? `tmp_${pipelinePath}` : pipelinePath
          }
        }
      ];

      if (!nearestReference.isArray) {
        pipelines.push(
          {
            $unwind: {
              path: `$${pipelinePath}`,
              preserveNullAndEmptyArrays: this._options.preserveNullAndEmptyArrays
            }
          }
        );
      } else {
        if (nearestReference.isArrayOfDocuments) {
          const {field, referenceField} = nearestReference;

          pipelines.push({
            $addFields: {
              [field]: {
                $map: {
                  input: `$${field}`,
                  in: {
                    $mergeObjects: [
                      '$$this',
                      {
                        [referenceField]: {
                          "$arrayElemAt": [
                            `$tmp_${pipelinePath}`,
                            {"$indexOfArray": [`$tmp_${pipelinePath}._id`, `$$this.${referenceField}`]}
                          ]
                        }
                      }
                    ]
                  }
                }
              }
            }
          });
        }
      }
    }

    if (path !== nearestReference.referencePath) {
      const prefix = `${this._options.referencePathPrefix}${nearestReference.referencePath}.`;
      const exclude = [...this._options.excludePaths, pipelinePath];
      const deepPath = path.replace(`${nearestReference.referencePath}.`, '');
      const lookuper = new Lookuper(nearestReference.referenceModel, {
        referencePathPrefix: prefix,
        excludePaths: exclude
      });

      pipelines = pipelines.concat(lookuper.lookup(deepPath));

      this._options.excludePaths = this._options.excludePaths.concat(lookuper._options.excludePaths);
    }

    this._options.excludePaths.push(pipelinePath);

    return pipelines;
  }
}

function isUnnecessaryPath(pathDescriptor) {
  return !isObjectIdPath(pathDescriptor) && !isArrayPath(pathDescriptor);
}

function isObjectIdPath(pathDescriptor) {
  return pathDescriptor && pathDescriptor.instance === 'ObjectID';
}

function isArrayPath(pathDescriptor) {
  return pathDescriptor && pathDescriptor.instance === 'Array';
}

function isArrayOfDocumentsPath(pathDescriptor) {
  return isArrayPath(pathDescriptor) && pathDescriptor.schema;
}

module.exports = Lookuper;
