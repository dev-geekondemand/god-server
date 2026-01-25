const Joi = require('joi');

const addressSchema = Joi.object({
  pin: Joi.string().required().min(6).max(6),
  city: Joi.string().required().min(2),
  state: Joi.string().required().min(2),
  country: Joi.string().required().min(2),
  line1: Joi.string().required(),
  line2: Joi.string().optional(),
  line3: Joi.string().optional(),
  coordinates: Joi.object({
    latitude: Joi.number(),
    longitude: Joi.number()
  }).optional()
});

const availabilitySchema = Joi.object({
  days: Joi.array().items(Joi.string()).required(),
  timeSlots: Joi.array().items(
    Joi.object({
      from: Joi.string().required(),
      to: Joi.string().required()
    })
  ).required()
});

const reviewSchema = Joi.array().items(
  Joi.object({
    rating: Joi.number().required(),
    comment: Joi.string().required(),
    postedBy: Joi.string().required(),
    replies: Joi.array().items(
      Joi.object({
        comment: Joi.string().required(),
        postedBy: Joi.string().required()
      })
    ).optional()
  })
);

const geekBaseSchema = Joi.object({
  refCode: Joi.string().optional(),
  type: Joi.string().valid('Individual', 'Corporate').required(),
  fullName: Joi.object({
    first: Joi.string().required(),
    last: Joi.string().required()
  }).required(),
  email: Joi.string().email().optional(),
  mobile: Joi.string().required(),
  profileImage: Joi.object({
    public_id: Joi.string(),
    url: Joi.string()
  }),
  primarySkill: Joi.string().required(),
  secondarySkills: Joi.array().items(Joi.string()).optional(),
  description: Joi.string().optional(),
  modeOfService: Joi.string().valid('Online', 'Offline', 'Carry In', 'All', 'None'),
  availability: availabilitySchema.optional(),
  rateCard: Joi.array().items(
    Joi.object({
      skill: Joi.string().required(),
      chargeType: Joi.string().valid('Hourly', 'Per Ticket').default('Per Ticket'),
      rate: Joi.number().required()
    })
  ).optional(),
  address: addressSchema.optional(),
  reviews: reviewSchema.optional(),
  profileCompleted: Joi.boolean().optional(),
  profileCompletedPercentage: Joi.number().optional(),
  // Individual fields
  dob: Joi.date().optional(),
  gender: Joi.string().optional(),
  qualifications: Joi.array().items(Joi.object()).optional(),
  idProof: Joi.object({
    type: Joi.string().valid('Aadhar', 'PAN').required(),
    idProofNumber: Joi.string().required(),
    isAdhaarVerified: Joi.boolean(),
    status: Joi.string().valid('Requested', 'Verified', 'Failed', "Null").default('Null'),
    requestId: Joi.string()
  }).optional(),
  languagePreferences: Joi.array().items(Joi.string()).optional(),
  brandsServiced: Joi.array().items(Joi.string()).optional(),
  // Corporate fields
  companyName: Joi.string().optional(),
  GSTIN: Joi.string().optional(),
  CIN: Joi.string().optional(),
  isVerified: Joi.boolean().optional(),
  companyDocs: Joi.array().items(Joi.object()).optional(),
  teamSize: Joi.number().optional(),
  teamMembers: Joi.array().items(Joi.object()).optional(),
  yoe: Joi.number().required(),
  otp: Joi.number().optional(),
  services: Joi.array().items(Joi.object()).optional()
});

module.exports = {
  geekBaseSchema,
  addressSchema,
  availabilitySchema
};
