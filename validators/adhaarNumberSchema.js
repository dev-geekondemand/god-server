const Joi = require('joi');

const adhaarNumberSchema = Joi.object({
    idNumber: Joi.string().required().length(12),
});

module.exports = adhaarNumberSchema;