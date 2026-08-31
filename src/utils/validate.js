export const isEmail = (v) => typeof v === 'string' && /^\S+@\S+\.\S+$/.test(v.trim());

export const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

/** Coerce whatever the client sent (JSON array, comma string, single) to an array. */
export function toArray(v) {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null || v === '') return [];
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t);
        return Array.isArray(parsed) ? parsed : [t];
      } catch {
        /* fall through */
      }
    }
    return t.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [v];
}

/** Returns { valid, errors, data } for an abstract submission. */
export function validateAbstract(body) {
  const errors = [];
  const data = {
    firstName: str(body.firstName ?? body.first_name),
    lastName: str(body.lastName ?? body.last_name),
    email: str(body.email),
    mobile: str(body.mobile),
    institution: str(body.institution),
    coAuthors: str(body.coAuthors ?? body.co_authors),
    membershipId: str(body.membershipId ?? body.membership_id),
    presentationType: str(body.presentationType ?? body.presentation_type),
    track: str(body.track),
    title: str(body.title),
    abstractBody: str(body.abstractBody ?? body.abstract_body),
    keywords: str(body.keywords),
    declarations: toArray(body.declarations),
  };

  if (!data.firstName) errors.push('First name is required.');
  if (!data.lastName) errors.push('Last name is required.');
  if (!isEmail(data.email)) errors.push('A valid email is required.');
  if (!data.mobile) errors.push('Mobile number is required.');
  if (!data.institution) errors.push('Institution / affiliation is required.');
  if (!data.presentationType) errors.push('Presentation type is required.');
  if (!data.track) errors.push('Track / theme is required.');
  if (!data.title) errors.push('Abstract title is required.');

  return { valid: errors.length === 0, errors, data };
}

/** Returns { valid, errors, data } for a delegate registration. */
export function validateRegistration(body) {
  const errors = [];
  const data = {
    reference: str(body.reference) || 'LTSI26-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    name: str(body.name),
    email: str(body.email),
    phone: str(body.phone),
    designation: str(body.designation),
    institution: str(body.institution),
    address: str(body.address),
    mciNumber: str(body.mciNumber ?? body.mci_number),
    mciState: str(body.mciState ?? body.mci_state),
    category: str(body.category),
    workshops: toArray(body.workshops),
    guests: Array.isArray(body.guests) ? body.guests : toArray(body.guests).map((n) => ({ name: n })),
    currency: str(body.currency),
    totalAmount:
      body.totalAmount === undefined && body.total_amount === undefined
        ? null
        : Number(body.totalAmount ?? body.total_amount) || 0,
    phase: str(body.phase),
  };

  if (!data.name) errors.push('Name is required.');
  if (!isEmail(data.email)) errors.push('A valid email is required.');

  return { valid: errors.length === 0, errors, data };
}
