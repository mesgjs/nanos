// redact a key
// redacted key isRedacted
// redacted key is hidden in toSLID({ redact: true }) (unredacted keys and indexes still appear)

// redact any index
// all indexes are isRedacted
// all positional values hidden in toSLID({ redact: true }) (unredacted keys still appear)

// redact true
// all keys and indexes isRedacted
// toSLID({ redact: true }) shows blanket redaction without individual key/index redaction