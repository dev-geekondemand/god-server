const Seeker = require('../models/seekerModel');
const Geek = require('../models/geekModel');

// The support ticket system is shared by Seekers and Geeks, but
// `authenticateJWT` decodes either a seeker or a geek cookie/token into the
// same generic `req.user` shape with no role claim. Resolve which collection
// the id actually belongs to by lookup rather than trusting a token field.
const resolveTicketActor = async (userId) => {
  const seeker = await Seeker.findById(userId);
  if (seeker) return { actor: seeker, actorModel: 'User' };

  const geek = await Geek.findById(userId);
  if (geek) return { actor: geek, actorModel: 'Geek' };

  return { actor: null, actorModel: null };
};

module.exports = resolveTicketActor;
