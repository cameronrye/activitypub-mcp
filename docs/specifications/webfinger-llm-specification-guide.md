# WebFinger Specification Guide for Large Language Models

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Conformance and Implementation Profiles](#conformance-and-implementation-profiles)
3. [Core Architecture](#core-architecture)
4. [Technical Implementation Details](#technical-implementation-details)
5. [JSON Resource Descriptor (JRD) Format](#json-resource-descriptor-jrd-format)
6. [Discovery Mechanisms](#discovery-mechanisms)
7. [Complete Request/Response Examples](#complete-requestresponse-examples)
8. [Security Considerations](#security-considerations)
9. [Integration with ActivityPub](#integration-with-activitypub)
10. [Implementation Patterns](#implementation-patterns)
11. [Interoperability Guidelines](#interoperability-guidelines)
12. [Error Handling and Edge Cases](#error-handling-and-edge-cases)
13. [Performance and Scalability](#performance-and-scalability)
14. [Complete Technical Requirements](#complete-technical-requirements)

---

## Executive Summary

### Purpose and Overview

WebFinger is an IETF Proposed Standard (RFC 7033, published September 2013) that defines a protocol for discovering information about people or other entities on the Internet using standard HTTP methods. WebFinger enables applications to discover metadata about resources identified by URIs that might not be directly usable as locators, such as email addresses or account identifiers.

### Core Concepts

WebFinger provides a standardized discovery mechanism with these fundamental components:

1. **Resource Discovery**: Find information about entities using well-known endpoints
2. **JSON Resource Descriptor (JRD)**: Structured metadata format for describing resources
3. **Link Relations**: Typed relationships that connect resources to related services
4. **Well-Known Endpoints**: Standardized discovery paths at `/.well-known/webfinger`

### Key Components

- **Query Target**: The URI identifying the entity being queried (resource parameter)
- **Link Relations**: Typed connections to related resources and services
- **Properties**: Key-value metadata about the queried resource
- **Aliases**: Alternative identifiers for the same resource
- **HTTPS Requirement**: Mandatory secure transport for all WebFinger operations

### Relationship to Social Web Protocols

WebFinger serves as a critical discovery layer in the social web ecosystem:

- **ActivityPub**: Enables actor discovery for federation and following relationships
- **OpenID Connect**: Facilitates identity provider discovery for authentication
- **OAuth 2.0**: Supports authorization server discovery
- **Social Web Protocols**: Provides foundational discovery capabilities for distributed social networks

### Discovery Workflow

1. **Resource Identification**: Client identifies target resource (e.g., `acct:user@example.com`)
2. **Host Resolution**: Extract host from resource identifier
3. **WebFinger Query**: HTTP GET to `https://host/.well-known/webfinger?resource=URI`
4. **JRD Response**: Server returns JSON Resource Descriptor with metadata and links
5. **Service Discovery**: Client follows relevant links to access services

---

## Conformance and Implementation Profiles

### Specification Compliance Levels

WebFinger implementations can support different levels of functionality:

#### WebFinger Client
- **Definition**: Implementation that performs WebFinger queries to discover resource information
- **Requirements**:
  - MUST support HTTPS-only queries
  - MUST properly encode query parameters
  - MUST handle JRD responses correctly
  - SHOULD implement appropriate caching
  - SHOULD handle error responses gracefully

#### WebFinger Server
- **Definition**: Implementation that responds to WebFinger queries with resource information
- **Requirements**:
  - MUST serve responses only over HTTPS
  - MUST support the `resource` query parameter
  - MUST return valid JRD responses
  - SHOULD support the `rel` parameter for filtering
  - SHOULD implement CORS for web application access

#### WebFinger Resource Provider
- **Definition**: Service that provides authoritative information about specific resources
- **Requirements**:
  - MUST verify ownership/authority over queried resources
  - MUST provide accurate and up-to-date information
  - SHOULD implement privacy controls
  - SHOULD support rate limiting and abuse prevention

### Normative Language

The specification uses RFC 2119 key words:
- **MUST**: Absolute requirement for conformance
- **MUST NOT**: Absolute prohibition
- **SHOULD**: Recommended but not required for conformance
- **SHOULD NOT**: Not recommended but not prohibited
- **MAY**: Optional feature or behavior

### Implementation Requirements

**Servers MUST**:
- Use HTTPS exclusively (HTTP MUST NOT be supported)
- Validate the `resource` parameter format
- Return appropriate HTTP status codes
- Include CORS headers for web application access
- Implement proper error handling

**Servers SHOULD**:
- Support link relation filtering via `rel` parameter
- Implement rate limiting to prevent abuse
- Provide caching headers for performance
- Log access for security monitoring
- Support multiple resource identifier formats

**Clients MUST**:
- Use HTTPS exclusively for all requests
- Properly encode query parameters
- Handle various HTTP status codes appropriately
- Validate JRD response format
- Respect caching headers

**Clients SHOULD**:
- Implement retry logic for temporary failures
- Cache responses according to server directives
- Handle partial responses gracefully
- Implement timeout mechanisms
- Support multiple JRD formats

---

## Core Architecture

### Protocol Overview

WebFinger operates as a simple HTTP-based discovery protocol with these core principles:

1. **Standardized Endpoint**: All WebFinger queries use the `/.well-known/webfinger` path
2. **HTTPS Requirement**: Security through mandatory encrypted transport
3. **Query-Based Discovery**: Resource information requested via URL query parameters
4. **JSON Response Format**: Structured metadata returned as JSON Resource Descriptor
5. **Link-Based Architecture**: Services discovered through typed link relations

### Discovery Process Flow

```
Client                    WebFinger Server                Resource Server
  |                             |                              |
  |  1. Identify Resource       |                              |
  |     (acct:alice@example.com)|                              |
  |                             |                              |
  |  2. Extract Host            |                              |
  |     (example.com)           |                              |
  |                             |                              |
  |  3. WebFinger Query         |                              |
  |----------------------------->|                              |
  |  GET /.well-known/webfinger |                              |
  |  ?resource=acct:alice@...   |                              |
  |                             |                              |
  |  4. JRD Response            |                              |
  |<-----------------------------|                              |
  |  { "subject": "acct:alice@...",                            |
  |    "links": [...] }         |                              |
  |                             |                              |
  |  5. Follow Service Links    |                              |
  |---------------------------------------------------------->|
  |                             |                              |
```

### Resource Identification

WebFinger supports various resource identifier formats:

**Account Identifiers (acct: scheme)**:
- Format: `acct:username@domain`
- Example: `acct:alice@social.example`
- Most common for user discovery

**HTTP/HTTPS URLs**:
- Format: `https://domain/path`
- Example: `https://blog.example.com/alice`
- Used for web resource discovery

**Email Addresses (mailto: scheme)**:
- Format: `mailto:user@domain`
- Example: `mailto:alice@example.com`
- Traditional email-based discovery

### Host Resolution Rules

The WebFinger specification defines clear rules for determining which server to query:

1. **Extract Host Component**: Parse the resource identifier to find the authoritative host
2. **Query Target Server**: Send WebFinger request to the extracted host
3. **HTTPS Requirement**: Always use HTTPS for the WebFinger query
4. **Port Handling**: Include non-standard ports in the host specification

**Host Resolution Examples**:
```
Resource: acct:alice@social.example:8443
Host: social.example:8443
Query: https://social.example:8443/.well-known/webfinger

Resource: https://blog.example.com/users/alice
Host: blog.example.com
Query: https://blog.example.com/.well-known/webfinger

Resource: mailto:alice@mail.example.org
Host: mail.example.org
Query: https://mail.example.org/.well-known/webfinger
```

---

## Technical Implementation Details

### HTTP Methods and Endpoints

#### WebFinger Endpoint

**Endpoint**: `/.well-known/webfinger`
**Method**: `GET` (MUST be supported)
**Protocol**: `HTTPS` (MUST be used, HTTP MUST NOT be supported)

#### Required Query Parameters

**resource** (REQUIRED):
- Contains the URI of the resource being queried
- MUST be percent-encoded according to RFC 3986
- Server MUST return 400 Bad Request if missing or malformed

**rel** (OPTIONAL):
- Filters response to include only specified link relation types
- Multiple `rel` parameters MAY be included
- Server SHOULD filter links when `rel` parameters are present
- Server MAY ignore `rel` parameters and return all links

#### Content Types

**Request Headers**:
```http
Accept: application/jrd+json, application/json
```

**Response Headers**:
```http
Content-Type: application/jrd+json
```

**Alternative Content Types**:
- `application/json`: Acceptable alternative
- `application/jrd+json`: Preferred and recommended

#### CORS Support

WebFinger servers MUST support Cross-Origin Resource Sharing (CORS) to enable web application access:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET
Access-Control-Allow-Headers: Accept
Access-Control-Max-Age: 3600
```

### Authentication and Authorization

#### Server-Side Authentication

WebFinger queries are typically **unauthenticated** for public resource discovery:
- No authentication required for public resource information
- Servers MAY require authentication for private or sensitive resources
- Authentication methods are implementation-specific

#### Privacy Controls

Servers SHOULD implement privacy controls:
- **Public Resources**: Freely discoverable information
- **Private Resources**: Require authentication or return limited information
- **Blocked Resources**: Return 404 Not Found to hide existence

#### Rate Limiting

Servers SHOULD implement rate limiting to prevent abuse:
- Per-IP address limits
- Per-resource limits
- Exponential backoff for repeated requests
- HTTP 429 Too Many Requests responses

### Error Response Format

WebFinger errors SHOULD be returned as structured JSON when possible:

```json
{
  "error": "invalid_resource",
  "error_description": "The resource parameter is malformed",
  "error_uri": "https://example.com/docs/webfinger-errors"
}
```

---

## JSON Resource Descriptor (JRD) Format

### JRD Structure Overview

The JSON Resource Descriptor (JRD) is the standard response format for WebFinger queries. It provides structured metadata about the queried resource using a well-defined JSON schema.

**Basic JRD Structure**:
```json
{
  "subject": "acct:alice@example.com",
  "aliases": [
    "https://social.example/users/alice",
    "https://example.com/~alice"
  ],
  "properties": {
    "http://example.com/ns/role": "administrator",
    "http://example.com/ns/created": "2023-01-15"
  },
  "links": [
    {
      "rel": "self",
      "type": "application/activity+json",
      "href": "https://social.example/users/alice"
    },
    {
      "rel": "http://webfinger.net/rel/profile-page",
      "type": "text/html",
      "href": "https://social.example/@alice"
    }
  ]
}
```

### Core JRD Properties

#### subject (REQUIRED)

**Purpose**: Identifies the resource that the JRD describes
**Type**: String (URI)
**Requirements**:
- MUST be present in every JRD response
- SHOULD match the queried resource parameter
- MUST be a valid URI

**Examples**:
```json
{
  "subject": "acct:alice@social.example"
}
```

#### aliases (OPTIONAL)

**Purpose**: Alternative identifiers for the same resource
**Type**: Array of strings (URIs)
**Requirements**:
- Each alias MUST be a valid URI
- Aliases SHOULD refer to the same logical resource
- MAY include different URI schemes for the same entity

**Examples**:
```json
{
  "aliases": [
    "https://social.example/users/alice",
    "https://social.example/@alice",
    "acct:alice@social.example"
  ]
}
```

#### properties (OPTIONAL)

**Purpose**: Key-value metadata about the resource
**Type**: Object with string keys and string/null values
**Requirements**:
- Keys MUST be URIs or registered property names
- Values MUST be strings or null
- null values indicate property removal or absence

**Examples**:
```json
{
  "properties": {
    "http://schema.org/name": "Alice Smith",
    "http://example.com/ns/role": "moderator",
    "http://example.com/ns/verified": "true",
    "http://example.com/ns/suspended": null
  }
}
```

#### links (OPTIONAL)

**Purpose**: Typed relationships to related resources and services
**Type**: Array of link objects
**Requirements**:
- Each link MUST have a `rel` property
- Links SHOULD have `href` property for external references
- Links MAY include additional metadata

**Link Object Structure**:
```json
{
  "rel": "http://webfinger.net/rel/profile-page",
  "type": "text/html",
  "href": "https://social.example/@alice",
  "titles": {
    "en": "Alice's Profile",
    "es": "Perfil de Alice"
  },
  "properties": {
    "http://example.com/ns/verified": "true"
  }
}
```

### Link Object Properties

#### rel (REQUIRED)

**Purpose**: Identifies the relationship type
**Type**: String
**Requirements**:
- MUST be either a registered link relation type or a URI
- Defines the semantic relationship between subject and target

**Common Link Relations**:
- `self`: Canonical representation of the resource
- `http://webfinger.net/rel/profile-page`: Human-readable profile page
- `http://webfinger.net/rel/avatar`: Profile image/avatar
- `http://schemas.google.com/g/2010#updates-from`: Activity stream

#### href (OPTIONAL)

**Purpose**: Target URI for the link relationship
**Type**: String (URI)
**Requirements**:
- MUST be a valid URI when present
- MAY be omitted for links that don't reference external resources

#### type (OPTIONAL)

**Purpose**: Media type of the linked resource
**Type**: String
**Requirements**:
- SHOULD be a valid MIME type
- Helps clients understand how to process the linked resource

**Examples**:
- `application/activity+json`: ActivityPub actor
- `text/html`: Web page
- `image/jpeg`: Image file
- `application/rss+xml`: RSS feed

#### titles (OPTIONAL)

**Purpose**: Human-readable titles for the link in multiple languages
**Type**: Object with language codes as keys
**Requirements**:
- Keys SHOULD be valid language tags (RFC 5646)
- Values MUST be strings

**Example**:
```json
{
  "titles": {
    "en": "Alice's ActivityPub Profile",
    "fr": "Profil ActivityPub d'Alice",
    "es": "Perfil ActivityPub de Alice"
  }
}
```

#### properties (OPTIONAL)

**Purpose**: Additional metadata specific to the link
**Type**: Object with string keys and string/null values
**Requirements**:
- Same format as top-level properties
- Provides link-specific metadata

### JRD Validation Rules

**Structural Requirements**:
- MUST be valid JSON
- MUST include `subject` property
- MAY include any combination of optional properties
- MUST NOT include unknown top-level properties

**URI Validation**:
- All URI values MUST be syntactically valid
- Relative URIs are NOT permitted
- Fragment identifiers MAY be included

**Content Validation**:
- Property keys MUST be URIs or registered names
- Link relation types MUST be URIs or registered types
- Language codes SHOULD follow RFC 5646

### Extension Mechanisms

#### Custom Properties

Applications MAY define custom properties using URI namespaces:

```json
{
  "properties": {
    "https://example.com/ns/account-type": "premium",
    "https://example.com/ns/join-date": "2023-01-15",
    "https://myapp.example/verified": "true"
  }
}
```

#### Custom Link Relations

Applications MAY define custom link relations using URIs:

```json
{
  "links": [
    {
      "rel": "https://example.com/rels/donation-page",
      "type": "text/html",
      "href": "https://donate.example.com/alice"
    }
  ]
}
```

---

## Discovery Mechanisms

### Well-Known Endpoint Specification

#### Endpoint Location

**Path**: `/.well-known/webfinger`
**Protocol**: HTTPS (REQUIRED)
**Method**: GET (REQUIRED)

The well-known endpoint MUST be available at the root of the domain:
```
https://example.com/.well-known/webfinger
```

#### Query Parameter Encoding

**Resource Parameter Encoding**:
All query parameters MUST be properly percent-encoded according to RFC 3986:

```javascript
// Correct encoding
const resource = "acct:alice@example.com";
const encoded = encodeURIComponent(resource);
// Result: "acct%3Aalice%40example.com"

const query = `/.well-known/webfinger?resource=${encoded}`;
```

**Multiple rel Parameters**:
```
/.well-known/webfinger?resource=acct%3Aalice%40example.com&rel=self&rel=http%3A//webfinger.net/rel/profile-page
```

### Resource Resolution Process

#### Step-by-Step Resolution

1. **Parse Resource Identifier**:
   ```javascript
   function parseResourceIdentifier(resource) {
     const url = new URL(resource);
     return {
       scheme: url.protocol.slice(0, -1),
       host: url.hostname,
       port: url.port,
       path: url.pathname,
       user: url.username
     };
   }
   ```

2. **Determine Target Host**:
   ```javascript
   function getWebFingerHost(resource) {
     if (resource.startsWith('acct:')) {
       const [, userHost] = resource.split('@');
       return userHost;
     }
     if (resource.startsWith('http')) {
       return new URL(resource).host;
     }
     if (resource.startsWith('mailto:')) {
       const [, domain] = resource.split('@');
       return domain;
     }
     throw new Error('Unsupported resource scheme');
   }
   ```

3. **Construct WebFinger URL**:
   ```javascript
   function buildWebFingerURL(host, resource, relations = []) {
     const baseURL = `https://${host}/.well-known/webfinger`;
     const params = new URLSearchParams();
     params.append('resource', resource);
     relations.forEach(rel => params.append('rel', rel));
     return `${baseURL}?${params.toString()}`;
   }
   ```

4. **Execute HTTP Request**:
   ```javascript
   async function performWebFingerQuery(url) {
     const response = await fetch(url, {
       method: 'GET',
       headers: {
         'Accept': 'application/jrd+json, application/json'
       }
     });

     if (!response.ok) {
       throw new WebFingerError(response.status, response.statusText);
     }

     return await response.json();
   }
   ```

### Link Relation Filtering

#### Using the rel Parameter

Clients MAY include `rel` parameters to filter the response:

**Single Relation**:
```
GET /.well-known/webfinger?resource=acct%3Aalice%40example.com&rel=self
```

**Multiple Relations**:
```
GET /.well-known/webfinger?resource=acct%3Aalice%40example.com&rel=self&rel=http%3A//webfinger.net/rel/profile-page
```

#### Server Filtering Behavior

**Filtering Requirements**:
- Servers SHOULD filter links when `rel` parameters are present
- Servers MAY ignore `rel` parameters and return all links
- Servers MUST NOT filter other JRD properties (subject, aliases, properties)

**Filtered Response Example**:
```json
{
  "subject": "acct:alice@example.com",
  "aliases": ["https://social.example/users/alice"],
  "properties": {
    "http://example.com/ns/role": "user"
  },
  "links": [
    {
      "rel": "self",
      "type": "application/activity+json",
      "href": "https://social.example/users/alice"
    }
  ]
}
```

### Caching and Performance

#### HTTP Caching Headers

Servers SHOULD include appropriate caching headers:

```http
HTTP/1.1 200 OK
Content-Type: application/jrd+json
Cache-Control: public, max-age=3600
ETag: "abc123def456"
Last-Modified: Wed, 21 Oct 2023 07:28:00 GMT
```

#### Client Caching Strategy

```javascript
class WebFingerCache {
  constructor(ttl = 3600000) { // 1 hour default
    this.cache = new Map();
    this.ttl = ttl;
  }

  get(resource) {
    const entry = this.cache.get(resource);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(resource);
      return null;
    }

    return entry.data;
  }

  set(resource, data) {
    this.cache.set(resource, {
      data,
      timestamp: Date.now()
    });
  }
}
```

---

## Complete Request/Response Examples

### Basic User Discovery

#### ActivityPub Actor Discovery

**Scenario**: Discovering an ActivityPub actor for federation

**Request**:
```http
GET /.well-known/webfinger?resource=acct%3Aalice%40social.example HTTP/1.1
Host: social.example
Accept: application/jrd+json, application/json
User-Agent: MyActivityPubClient/1.0
```

**Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/jrd+json
Access-Control-Allow-Origin: *
Cache-Control: public, max-age=3600
ETag: "abc123def456"

{
  "subject": "acct:alice@social.example",
  "aliases": [
    "https://social.example/users/alice",
    "https://social.example/@alice"
  ],
  "properties": {
    "http://schema.org/name": "Alice Smith"
  },
  "links": [
    {
      "rel": "self",
      "type": "application/activity+json",
      "href": "https://social.example/users/alice"
    },
    {
      "rel": "http://webfinger.net/rel/profile-page",
      "type": "text/html",
      "href": "https://social.example/@alice",
      "titles": {
        "en": "Alice's Profile"
      }
    },
    {
      "rel": "http://webfinger.net/rel/avatar",
      "type": "image/jpeg",
      "href": "https://social.example/avatars/alice.jpg"
    }
  ]
}
```

#### OpenID Connect Discovery

**Scenario**: Discovering OpenID Connect provider for authentication

**Request**:
```http
GET /.well-known/webfinger?resource=acct%3Acarol%40example.com&rel=http%3A%2F%2Fopenid.net%2Fspecs%2Fconnect%2F1.0%2Fissuer HTTP/1.1
Host: example.com
Accept: application/jrd+json
```

**Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/jrd+json
Access-Control-Allow-Origin: *

{
  "subject": "acct:carol@example.com",
  "links": [
    {
      "rel": "http://openid.net/specs/connect/1.0/issuer",
      "href": "https://openid.example.com"
    }
  ]
}
```

### Web Resource Discovery

#### Blog Post Metadata Discovery

**Scenario**: Discovering metadata about a blog post

**Request**:
```http
GET /.well-known/webfinger?resource=http%3A%2F%2Fblog.example.com%2Farticle%2Fid%2F314 HTTP/1.1
Host: blog.example.com
Accept: application/jrd+json
```

**Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/jrd+json
Access-Control-Allow-Origin: *
Cache-Control: public, max-age=1800

{
  "subject": "http://blog.example.com/article/id/314",
  "aliases": [
    "http://blog.example.com/cool_new_thing",
    "http://blog.example.com/steve/article/7"
  ],
  "properties": {
    "http://blgx.example.net/ns/version": "1.3",
    "http://blgx.example.net/ns/ext": null
  },
  "links": [
    {
      "rel": "copyright",
      "href": "http://www.example.com/copyright"
    },
    {
      "rel": "author",
      "href": "http://blog.example.com/author/steve",
      "titles": {
        "en-us": "The Magical World of Steve",
        "fr": "Le Monde Magique de Steve"
      },
      "properties": {
        "http://example.com/role": "editor"
      }
    }
  ]
}
```

### Multi-Service Discovery

#### Complete Social Profile Discovery

**Scenario**: Discovering all services associated with a user

**Request**:
```http
GET /.well-known/webfinger?resource=acct%3Abob%40example.org HTTP/1.1
Host: example.org
Accept: application/jrd+json
```

**Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/jrd+json
Access-Control-Allow-Origin: *
Cache-Control: public, max-age=7200

{
  "subject": "acct:bob@example.org",
  "aliases": [
    "https://social.example.org/users/bob",
    "https://example.org/~bob",
    "mailto:bob@example.org"
  ],
  "properties": {
    "http://schema.org/name": "Bob Johnson",
    "http://example.org/ns/verified": "true",
    "http://example.org/ns/created": "2023-01-15T10:30:00Z"
  },
  "links": [
    {
      "rel": "self",
      "type": "application/activity+json",
      "href": "https://social.example.org/users/bob",
      "titles": {
        "en": "Bob's ActivityPub Actor"
      }
    },
    {
      "rel": "http://webfinger.net/rel/profile-page",
      "type": "text/html",
      "href": "https://example.org/~bob",
      "titles": {
        "en": "Bob's Homepage"
      }
    },
    {
      "rel": "http://webfinger.net/rel/avatar",
      "type": "image/png",
      "href": "https://cdn.example.org/avatars/bob.png"
    },
    {
      "rel": "http://schemas.google.com/g/2010#updates-from",
      "type": "application/atom+xml",
      "href": "https://blog.example.org/bob/feed.atom",
      "titles": {
        "en": "Bob's Blog Feed"
      }
    },
    {
      "rel": "http://microformats.org/profile/hcard",
      "type": "text/html",
      "href": "https://example.org/~bob/contact"
    },
    {
      "rel": "http://openid.net/specs/connect/1.0/issuer",
      "href": "https://auth.example.org"
    }
  ]
}
```

### Filtered Discovery Examples

#### Single Relation Filter

**Request**:
```http
GET /.well-known/webfinger?resource=acct%3Aalice%40social.example&rel=self HTTP/1.1
Host: social.example
Accept: application/jrd+json
```

**Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/jrd+json

{
  "subject": "acct:alice@social.example",
  "aliases": [
    "https://social.example/users/alice"
  ],
  "links": [
    {
      "rel": "self",
      "type": "application/activity+json",
      "href": "https://social.example/users/alice"
    }
  ]
}
```

#### Multiple Relation Filter

**Request**:
```http
GET /.well-known/webfinger?resource=acct%3Aalice%40social.example&rel=self&rel=http%3A//webfinger.net/rel/profile-page HTTP/1.1
Host: social.example
Accept: application/jrd+json
```

**Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/jrd+json

{
  "subject": "acct:alice@social.example",
  "aliases": [
    "https://social.example/users/alice"
  ],
  "links": [
    {
      "rel": "self",
      "type": "application/activity+json",
      "href": "https://social.example/users/alice"
    },
    {
      "rel": "http://webfinger.net/rel/profile-page",
      "type": "text/html",
      "href": "https://social.example/@alice"
    }
  ]
}
```

---

## Security Considerations

### Privacy and Information Disclosure

#### Information Exposure Risks

WebFinger can expose sensitive information about users and resources:

**User Enumeration**:
- Attackers can discover valid user accounts
- May reveal internal user identifiers
- Can be used for targeted attacks

**Mitigation Strategies**:
```javascript
// Rate limiting implementation
class RateLimiter {
  constructor(maxRequests = 100, windowMs = 3600000) {
    this.requests = new Map();
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  isAllowed(clientIP) {
    const now = Date.now();
    const clientRequests = this.requests.get(clientIP) || [];

    // Remove old requests outside the window
    const validRequests = clientRequests.filter(
      timestamp => now - timestamp < this.windowMs
    );

    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    validRequests.push(now);
    this.requests.set(clientIP, validRequests);
    return true;
  }
}
```

#### Privacy Controls

**Public vs Private Information**:
```javascript
function generateJRD(resource, isPublic, userPreferences) {
  const baseJRD = {
    subject: resource
  };

  if (isPublic || userPreferences.allowDiscovery) {
    baseJRD.aliases = getUserAliases(resource);
    baseJRD.links = getPublicLinks(resource);
  }

  if (userPreferences.showProfile) {
    baseJRD.links.push({
      rel: "http://webfinger.net/rel/profile-page",
      type: "text/html",
      href: getProfileURL(resource)
    });
  }

  return baseJRD;
}
```

### Abuse Prevention

#### Harvesting Protection

**Detection Patterns**:
- High-frequency requests from single IP
- Sequential user enumeration attempts
- Automated scanning patterns

**Protection Implementation**:
```javascript
class AbuseDetector {
  constructor() {
    this.suspiciousPatterns = new Map();
  }

  analyzeRequest(clientIP, resource, userAgent) {
    const pattern = this.getRequestPattern(clientIP);

    // Detect sequential enumeration
    if (this.isSequentialEnumeration(pattern)) {
      return { block: true, reason: 'enumeration' };
    }

    // Detect bot behavior
    if (this.isBotBehavior(userAgent, pattern)) {
      return { block: true, reason: 'bot' };
    }

    return { block: false };
  }

  isSequentialEnumeration(pattern) {
    // Check for patterns like user1, user2, user3...
    const resources = pattern.map(p => p.resource);
    return this.detectSequentialPattern(resources);
  }
}
```

#### Rate Limiting Strategies

**Per-IP Rate Limiting**:
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 3600
Content-Type: application/json

{
  "error": "rate_limit_exceeded",
  "error_description": "Too many requests from this IP address",
  "retry_after": 3600
}
```

**Per-Resource Rate Limiting**:
```javascript
class ResourceRateLimiter {
  constructor() {
    this.resourceCounts = new Map();
  }

  checkResourceLimit(resource, clientIP) {
    const key = `${resource}:${clientIP}`;
    const count = this.resourceCounts.get(key) || 0;

    if (count > 10) { // Max 10 requests per resource per IP per hour
      return false;
    }

    this.resourceCounts.set(key, count + 1);
    return true;
  }
}
```

### Authentication and Authorization

#### Server Authentication

**HTTPS Requirement**:
- All WebFinger communication MUST use HTTPS
- Prevents man-in-the-middle attacks
- Protects query parameters and responses

**Certificate Validation**:
```javascript
async function secureWebFingerQuery(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/jrd+json'
    },
    // Ensure certificate validation
    agent: new https.Agent({
      rejectUnauthorized: true,
      checkServerIdentity: (host, cert) => {
        return tls.checkServerIdentity(host, cert);
      }
    })
  });

  return response;
}
```

#### Access Control

**Resource Authorization**:
```javascript
function authorizeResourceAccess(resource, clientInfo) {
  const resourceOwner = getResourceOwner(resource);

  // Check if resource is public
  if (resourceOwner.isPublic) {
    return { allowed: true };
  }

  // Check if client is authenticated
  if (!clientInfo.authenticated) {
    return { allowed: false, reason: 'authentication_required' };
  }

  // Check if client has permission
  if (!hasPermission(clientInfo.user, resource)) {
    return { allowed: false, reason: 'insufficient_permissions' };
  }

  return { allowed: true };
}
```

### Content Validation

#### Input Validation

**Resource Parameter Validation**:
```javascript
function validateResourceParameter(resource) {
  // Check for valid URI format
  try {
    new URL(resource);
  } catch (error) {
    throw new ValidationError('Invalid resource URI format');
  }

  // Check for supported schemes
  const supportedSchemes = ['acct', 'http', 'https', 'mailto'];
  const scheme = resource.split(':')[0];

  if (!supportedSchemes.includes(scheme)) {
    throw new ValidationError(`Unsupported URI scheme: ${scheme}`);
  }

  // Additional scheme-specific validation
  if (scheme === 'acct') {
    validateAcctScheme(resource);
  }
}

function validateAcctScheme(resource) {
  const acctPattern = /^acct:([^@]+)@([^@]+)$/;
  if (!acctPattern.test(resource)) {
    throw new ValidationError('Invalid acct: URI format');
  }
}
```

#### Response Validation

**JRD Structure Validation**:
```javascript
function validateJRD(jrd) {
  // Required subject property
  if (!jrd.subject || typeof jrd.subject !== 'string') {
    throw new ValidationError('JRD must have a subject property');
  }

  // Validate aliases
  if (jrd.aliases && !Array.isArray(jrd.aliases)) {
    throw new ValidationError('aliases must be an array');
  }

  // Validate links
  if (jrd.links) {
    if (!Array.isArray(jrd.links)) {
      throw new ValidationError('links must be an array');
    }

    jrd.links.forEach(validateLink);
  }

  // Validate properties
  if (jrd.properties && typeof jrd.properties !== 'object') {
    throw new ValidationError('properties must be an object');
  }
}

function validateLink(link) {
  if (!link.rel || typeof link.rel !== 'string') {
    throw new ValidationError('Link must have a rel property');
  }

  if (link.href && typeof link.href !== 'string') {
    throw new ValidationError('Link href must be a string');
  }
}
```

### Network Security

#### TLS Requirements

**Minimum TLS Version**:
- MUST use TLS 1.2 or higher
- SHOULD use TLS 1.3 when available
- MUST validate certificate chains
- SHOULD implement certificate pinning for critical services

**Security Headers**:
```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'none'
```

#### Network Access Controls

**IP Filtering**:
```javascript
class IPFilter {
  constructor() {
    this.blockedRanges = [
      '10.0.0.0/8',      // Private networks
      '172.16.0.0/12',
      '192.168.0.0/16',
      '127.0.0.0/8'      // Localhost
    ];
  }

  isAllowed(clientIP) {
    // Block private IP ranges in production
    if (process.env.NODE_ENV === 'production') {
      return !this.isPrivateIP(clientIP);
    }
    return true;
  }

  isPrivateIP(ip) {
    return this.blockedRanges.some(range =>
      this.ipInRange(ip, range)
    );
  }
}
```

---

## Integration with ActivityPub

### Actor Discovery Workflow

WebFinger serves as the primary discovery mechanism for ActivityPub actors in federated social networks. The integration follows a standardized pattern that enables cross-server actor resolution.

#### Complete Discovery Process

1. **User Identifier Input**: User provides identifier (e.g., `@alice@social.example`)
2. **WebFinger Query**: Client queries WebFinger endpoint
3. **Actor URL Discovery**: Extract ActivityPub actor URL from response
4. **Actor Object Retrieval**: Fetch full ActivityPub actor object
5. **Service Integration**: Use actor for following, messaging, etc.

```javascript
async function discoverActivityPubActor(identifier) {
  // Step 1: Parse user identifier
  const resource = parseUserIdentifier(identifier);

  // Step 2: Perform WebFinger query
  const webfingerResponse = await performWebFingerQuery(resource);

  // Step 3: Extract ActivityPub actor URL
  const actorURL = extractActivityPubURL(webfingerResponse);

  // Step 4: Fetch ActivityPub actor object
  const actor = await fetchActivityPubActor(actorURL);

  return actor;
}

function parseUserIdentifier(identifier) {
  // Handle @user@domain format
  if (identifier.startsWith('@')) {
    const [, user, domain] = identifier.match(/@([^@]+)@(.+)/);
    return `acct:${user}@${domain}`;
  }

  // Handle acct: format directly
  if (identifier.startsWith('acct:')) {
    return identifier;
  }

  throw new Error('Unsupported identifier format');
}

async function extractActivityPubURL(jrd) {
  const selfLink = jrd.links.find(link =>
    link.rel === 'self' &&
    link.type === 'application/activity+json'
  );

  if (!selfLink) {
    throw new Error('No ActivityPub actor URL found');
  }

  return selfLink.href;
}
```

### ActivityPub-Specific Link Relations

#### Standard ActivityPub Relations

**self**: Primary ActivityPub actor object
```json
{
  "rel": "self",
  "type": "application/activity+json",
  "href": "https://social.example/users/alice"
}
```

**http://webfinger.net/rel/profile-page**: Human-readable profile
```json
{
  "rel": "http://webfinger.net/rel/profile-page",
  "type": "text/html",
  "href": "https://social.example/@alice"
}
```

**http://ostatus.org/schema/1.0/subscribe**: Remote follow endpoint
```json
{
  "rel": "http://ostatus.org/schema/1.0/subscribe",
  "template": "https://social.example/authorize_interaction?uri={uri}"
}
```

#### Extended ActivityPub Relations

**Inbox Discovery**:
```json
{
  "rel": "https://www.w3.org/ns/activitystreams#inbox",
  "type": "application/activity+json",
  "href": "https://social.example/users/alice/inbox"
}
```

**Outbox Discovery**:
```json
{
  "rel": "https://www.w3.org/ns/activitystreams#outbox",
  "type": "application/activity+json",
  "href": "https://social.example/users/alice/outbox"
}
```

### Federation Discovery Patterns

#### Cross-Server Following

**Scenario**: User on server A wants to follow user on server B

```javascript
async function initiateRemoteFollow(localUser, remoteIdentifier) {
  try {
    // Discover remote actor via WebFinger
    const remoteActor = await discoverActivityPubActor(remoteIdentifier);

    // Create Follow activity
    const followActivity = {
      "@context": "https://www.w3.org/ns/activitystreams",
      "type": "Follow",
      "actor": localUser.id,
      "object": remoteActor.id
    };

    // Deliver to remote inbox
    await deliverActivity(followActivity, remoteActor.inbox);

    return { success: true, actor: remoteActor };
  } catch (error) {
    console.error('Remote follow failed:', error);
    return { success: false, error: error.message };
  }
}
```

#### Server-to-Server Discovery

**Shared Inbox Discovery**:
```json
{
  "rel": "https://www.w3.org/ns/activitystreams#sharedInbox",
  "type": "application/activity+json",
  "href": "https://social.example/inbox"
}
```

**Implementation**:
```javascript
async function discoverSharedInbox(domain) {
  const resource = `https://${domain}/`;
  const jrd = await performWebFingerQuery(resource);

  const sharedInboxLink = jrd.links.find(link =>
    link.rel === 'https://www.w3.org/ns/activitystreams#sharedInbox'
  );

  return sharedInboxLink ? sharedInboxLink.href : null;
}
```

### WebFinger Response for ActivityPub Actors

#### Complete ActivityPub Actor WebFinger Response

```json
{
  "subject": "acct:alice@social.example",
  "aliases": [
    "https://social.example/users/alice",
    "https://social.example/@alice"
  ],
  "properties": {
    "http://schema.org/name": "Alice Smith",
    "https://social.example/ns/verified": "true"
  },
  "links": [
    {
      "rel": "self",
      "type": "application/activity+json",
      "href": "https://social.example/users/alice"
    },
    {
      "rel": "http://webfinger.net/rel/profile-page",
      "type": "text/html",
      "href": "https://social.example/@alice",
      "titles": {
        "en": "Alice's Profile"
      }
    },
    {
      "rel": "http://webfinger.net/rel/avatar",
      "type": "image/jpeg",
      "href": "https://social.example/avatars/alice.jpg"
    },
    {
      "rel": "http://ostatus.org/schema/1.0/subscribe",
      "template": "https://social.example/authorize_interaction?uri={uri}"
    },
    {
      "rel": "https://www.w3.org/ns/activitystreams#inbox",
      "type": "application/activity+json",
      "href": "https://social.example/users/alice/inbox"
    },
    {
      "rel": "https://www.w3.org/ns/activitystreams#outbox",
      "type": "application/activity+json",
      "href": "https://social.example/users/alice/outbox"
    },
    {
      "rel": "https://www.w3.org/ns/activitystreams#following",
      "type": "application/activity+json",
      "href": "https://social.example/users/alice/following"
    },
    {
      "rel": "https://www.w3.org/ns/activitystreams#followers",
      "type": "application/activity+json",
      "href": "https://social.example/users/alice/followers"
    }
  ]
}
```

### Error Handling in ActivityPub Context

#### Actor Not Found

```javascript
async function handleActorDiscoveryError(identifier, error) {
  if (error.status === 404) {
    // Actor doesn't exist or server doesn't support WebFinger
    return {
      error: 'actor_not_found',
      message: `Actor ${identifier} not found`,
      suggestion: 'Verify the identifier format and server support'
    };
  }

  if (error.status === 403) {
    // Actor exists but is private/blocked
    return {
      error: 'actor_private',
      message: `Actor ${identifier} is not publicly discoverable`,
      suggestion: 'Contact the user directly for access'
    };
  }

  // Network or server errors
  return {
    error: 'discovery_failed',
    message: 'Failed to discover actor',
    suggestion: 'Try again later or contact server administrator'
  };
}
```

#### Fallback Discovery Methods

```javascript
async function discoverActorWithFallback(identifier) {
  try {
    // Primary: WebFinger discovery
    return await discoverActivityPubActor(identifier);
  } catch (webfingerError) {
    try {
      // Fallback: Direct actor URL construction
      const actorURL = constructDirectActorURL(identifier);
      return await fetchActivityPubActor(actorURL);
    } catch (directError) {
      // Final fallback: Search API if available
      return await searchForActor(identifier);
    }
  }
}

function constructDirectActorURL(identifier) {
  const [user, domain] = identifier.replace('acct:', '').split('@');
  return `https://${domain}/users/${user}`;
}
```

### Performance Optimization for ActivityPub

#### Caching Strategies

```javascript
class ActivityPubDiscoveryCache {
  constructor() {
    this.actorCache = new Map();
    this.webfingerCache = new Map();
    this.ttl = 3600000; // 1 hour
  }

  async getActor(identifier) {
    // Check actor cache first
    const cachedActor = this.actorCache.get(identifier);
    if (cachedActor && !this.isExpired(cachedActor)) {
      return cachedActor.data;
    }

    // Check WebFinger cache
    const cachedWebFinger = this.webfingerCache.get(identifier);
    if (cachedWebFinger && !this.isExpired(cachedWebFinger)) {
      const actorURL = extractActivityPubURL(cachedWebFinger.data);
      const actor = await fetchActivityPubActor(actorURL);
      this.cacheActor(identifier, actor);
      return actor;
    }

    // Full discovery
    const actor = await discoverActivityPubActor(identifier);
    this.cacheActor(identifier, actor);
    return actor;
  }

  cacheActor(identifier, actor) {
    this.actorCache.set(identifier, {
      data: actor,
      timestamp: Date.now()
    });
  }
}
```

#### Batch Discovery

```javascript
async function discoverMultipleActors(identifiers) {
  const discoveries = identifiers.map(async (identifier) => {
    try {
      const actor = await discoverActivityPubActor(identifier);
      return { identifier, actor, success: true };
    } catch (error) {
      return { identifier, error, success: false };
    }
  });

  return await Promise.allSettled(discoveries);
}
```

---

## Implementation Patterns

### Client Implementation Patterns

#### WebFinger Client Library

```javascript
class WebFingerClient {
  constructor(options = {}) {
    this.timeout = options.timeout || 5000;
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 3600000; // 1 hour
    this.userAgent = options.userAgent || 'WebFingerClient/1.0';
  }

  async discover(resource, relations = []) {
    // Check cache first
    const cacheKey = this.getCacheKey(resource, relations);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    // Perform discovery
    const host = this.extractHost(resource);
    const url = this.buildURL(host, resource, relations);

    try {
      const response = await this.performRequest(url);
      const jrd = await response.json();

      // Validate response
      this.validateJRD(jrd);

      // Cache result
      this.setCache(cacheKey, jrd);

      return jrd;
    } catch (error) {
      throw new WebFingerError(error.message, error.status);
    }
  }

  extractHost(resource) {
    if (resource.startsWith('acct:')) {
      return resource.split('@')[1];
    }
    if (resource.startsWith('http')) {
      return new URL(resource).host;
    }
    if (resource.startsWith('mailto:')) {
      return resource.split('@')[1];
    }
    throw new Error('Unsupported resource format');
  }

  buildURL(host, resource, relations) {
    const baseURL = `https://${host}/.well-known/webfinger`;
    const params = new URLSearchParams();
    params.append('resource', resource);
    relations.forEach(rel => params.append('rel', rel));
    return `${baseURL}?${params.toString()}`;
  }

  async performRequest(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/jrd+json, application/json',
          'User-Agent': this.userAgent
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  validateJRD(jrd) {
    if (!jrd.subject) {
      throw new Error('Invalid JRD: missing subject');
    }

    if (jrd.links && !Array.isArray(jrd.links)) {
      throw new Error('Invalid JRD: links must be array');
    }

    if (jrd.aliases && !Array.isArray(jrd.aliases)) {
      throw new Error('Invalid JRD: aliases must be array');
    }
  }

  getCacheKey(resource, relations) {
    return `${resource}:${relations.sort().join(',')}`;
  }

  getFromCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
}

class WebFingerError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'WebFingerError';
    this.status = status;
  }
}
```

#### Usage Examples

```javascript
// Basic usage
const client = new WebFingerClient();
const jrd = await client.discover('acct:alice@example.com');

// With relation filtering
const actorJRD = await client.discover(
  'acct:alice@example.com',
  ['self', 'http://webfinger.net/rel/profile-page']
);

// ActivityPub actor discovery
async function findActivityPubActor(identifier) {
  const jrd = await client.discover(identifier, ['self']);
  const actorLink = jrd.links.find(link =>
    link.rel === 'self' &&
    link.type === 'application/activity+json'
  );

  if (!actorLink) {
    throw new Error('No ActivityPub actor found');
  }

  const actorResponse = await fetch(actorLink.href, {
    headers: { 'Accept': 'application/activity+json' }
  });

  return await actorResponse.json();
}
```

### Server Implementation Patterns

#### WebFinger Server Framework

```javascript
class WebFingerServer {
  constructor(options = {}) {
    this.resourceProviders = new Map();
    this.rateLimiter = new RateLimiter(options.rateLimit);
    this.cache = new ResponseCache(options.cache);
    this.corsEnabled = options.cors !== false;
  }

  registerResourceProvider(pattern, provider) {
    this.resourceProviders.set(pattern, provider);
  }

  async handleRequest(req, res) {
    try {
      // CORS headers
      if (this.corsEnabled) {
        this.setCORSHeaders(res);
      }

      // Rate limiting
      if (!this.rateLimiter.isAllowed(req.ip)) {
        return this.sendError(res, 429, 'rate_limit_exceeded');
      }

      // Parse query parameters
      const { resource, rel } = this.parseQuery(req.query);

      if (!resource) {
        return this.sendError(res, 400, 'missing_resource');
      }

      // Check cache
      const cacheKey = this.getCacheKey(resource, rel);
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return this.sendJRD(res, cached);
      }

      // Find resource provider
      const provider = this.findProvider(resource);
      if (!provider) {
        return this.sendError(res, 404, 'resource_not_found');
      }

      // Generate JRD
      const jrd = await provider.getJRD(resource, rel);

      // Cache response
      await this.cache.set(cacheKey, jrd);

      // Send response
      this.sendJRD(res, jrd);

    } catch (error) {
      console.error('WebFinger error:', error);
      this.sendError(res, 500, 'internal_error');
    }
  }

  findProvider(resource) {
    for (const [pattern, provider] of this.resourceProviders) {
      if (this.matchesPattern(resource, pattern)) {
        return provider;
      }
    }
    return null;
  }

  matchesPattern(resource, pattern) {
    if (typeof pattern === 'string') {
      return resource.includes(pattern);
    }
    if (pattern instanceof RegExp) {
      return pattern.test(resource);
    }
    if (typeof pattern === 'function') {
      return pattern(resource);
    }
    return false;
  }

  parseQuery(query) {
    const resource = query.resource;
    const rel = Array.isArray(query.rel) ? query.rel : [query.rel].filter(Boolean);
    return { resource, rel };
  }

  setCORSHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Accept');
    res.setHeader('Access-Control-Max-Age', '3600');
  }

  sendJRD(res, jrd) {
    res.setHeader('Content-Type', 'application/jrd+json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).json(jrd);
  }

  sendError(res, status, error) {
    res.status(status).json({
      error,
      error_description: this.getErrorDescription(error)
    });
  }

  getErrorDescription(error) {
    const descriptions = {
      'missing_resource': 'The resource parameter is required',
      'resource_not_found': 'The requested resource was not found',
      'rate_limit_exceeded': 'Too many requests',
      'internal_error': 'Internal server error'
    };
    return descriptions[error] || 'Unknown error';
  }
}
```

#### Resource Provider Implementation

```javascript
class ActivityPubResourceProvider {
  constructor(userService) {
    this.userService = userService;
  }

  async getJRD(resource, relations = []) {
    const user = await this.resolveUser(resource);
    if (!user) {
      throw new Error('User not found');
    }

    const jrd = {
      subject: resource,
      aliases: this.getUserAliases(user),
      properties: this.getUserProperties(user),
      links: this.getUserLinks(user, relations)
    };

    return jrd;
  }

  async resolveUser(resource) {
    if (resource.startsWith('acct:')) {
      const [username, domain] = resource.replace('acct:', '').split('@');
      return await this.userService.findByUsername(username);
    }

    if (resource.startsWith('https://')) {
      const url = new URL(resource);
      const username = url.pathname.split('/').pop();
      return await this.userService.findByUsername(username);
    }

    return null;
  }

  getUserAliases(user) {
    return [
      `https://${process.env.DOMAIN}/users/${user.username}`,
      `https://${process.env.DOMAIN}/@${user.username}`
    ];
  }

  getUserProperties(user) {
    const properties = {};

    if (user.displayName) {
      properties['http://schema.org/name'] = user.displayName;
    }

    if (user.verified) {
      properties[`https://${process.env.DOMAIN}/ns/verified`] = 'true';
    }

    return properties;
  }

  getUserLinks(user, relations) {
    const allLinks = [
      {
        rel: 'self',
        type: 'application/activity+json',
        href: `https://${process.env.DOMAIN}/users/${user.username}`
      },
      {
        rel: 'http://webfinger.net/rel/profile-page',
        type: 'text/html',
        href: `https://${process.env.DOMAIN}/@${user.username}`
      },
      {
        rel: 'http://webfinger.net/rel/avatar',
        type: 'image/jpeg',
        href: user.avatarURL
      }
    ];

    // Filter by relations if specified
    if (relations.length > 0) {
      return allLinks.filter(link => relations.includes(link.rel));
    }

    return allLinks;
  }
}
```

#### Express.js Integration

```javascript
const express = require('express');
const app = express();

// Initialize WebFinger server
const webfingerServer = new WebFingerServer({
  cors: true,
  rateLimit: { maxRequests: 100, windowMs: 3600000 }
});

// Register resource providers
webfingerServer.registerResourceProvider(
  /^acct:[^@]+@example\.com$/,
  new ActivityPubResourceProvider(userService)
);

// WebFinger endpoint
app.get('/.well-known/webfinger', (req, res) => {
  webfingerServer.handleRequest(req, res);
});

app.listen(3000, () => {
  console.log('WebFinger server running on port 3000');
});
```

---

## Interoperability Guidelines

### Cross-Platform Compatibility

#### Mastodon Compatibility

Mastodon is the most widely deployed ActivityPub implementation and sets de facto standards for WebFinger usage:

**Expected Link Relations**:
```json
{
  "subject": "acct:alice@mastodon.example",
  "links": [
    {
      "rel": "self",
      "type": "application/activity+json",
      "href": "https://mastodon.example/users/alice"
    },
    {
      "rel": "http://webfinger.net/rel/profile-page",
      "type": "text/html",
      "href": "https://mastodon.example/@alice"
    },
    {
      "rel": "http://ostatus.org/schema/1.0/subscribe",
      "template": "https://mastodon.example/authorize_interaction?uri={uri}"
    }
  ]
}
```

**Mastodon-Specific Considerations**:
- Always includes `subscribe` relation for remote follows
- Uses template URLs with `{uri}` placeholder
- Expects specific URL patterns for profile pages

#### Pleroma/Akkoma Compatibility

Pleroma and its fork Akkoma have some variations in WebFinger implementation:

**Additional Relations**:
```json
{
  "links": [
    {
      "rel": "http://schemas.google.com/g/2010#updates-from",
      "type": "application/atom+xml",
      "href": "https://pleroma.example/users/alice/feed.atom"
    },
    {
      "rel": "salmon",
      "href": "https://pleroma.example/users/alice/salmon"
    }
  ]
}
```

#### Misskey Compatibility

Misskey uses different URL patterns and may include additional metadata:

**Misskey-Specific Patterns**:
```json
{
  "subject": "acct:alice@misskey.example",
  "aliases": [
    "https://misskey.example/users/alice",
    "https://misskey.example/@alice"
  ],
  "links": [
    {
      "rel": "self",
      "type": "application/activity+json",
      "href": "https://misskey.example/users/alice"
    },
    {
      "rel": "http://webfinger.net/rel/profile-page",
      "type": "text/html",
      "href": "https://misskey.example/@alice"
    }
  ]
}
```

### Standards Compliance

#### RFC 7033 Compliance

**MUST Requirements**:
- Use HTTPS exclusively
- Support the `resource` query parameter
- Return valid JRD format
- Include `subject` in all responses

**SHOULD Requirements**:
- Support the `rel` query parameter for filtering
- Include CORS headers for web application access
- Implement appropriate caching
- Provide meaningful error responses

**MAY Requirements**:
- Support additional query parameters
- Include custom properties and link relations
- Implement authentication for private resources

#### JSON-LD Compatibility

While WebFinger uses JSON format, it should be compatible with JSON-LD processing:

```json
{
  "@context": "http://webfinger.net/ns/webfinger",
  "subject": "acct:alice@example.com",
  "aliases": ["https://example.com/users/alice"],
  "links": [
    {
      "rel": "self",
      "type": "application/activity+json",
      "href": "https://example.com/users/alice"
    }
  ]
}
```

### Content Type Negotiation

#### Supported Media Types

**Primary**: `application/jrd+json`
```http
Accept: application/jrd+json
```

**Alternative**: `application/json`
```http
Accept: application/json
```

**Fallback**: `*/*`
```http
Accept: */*
```

#### Response Content-Type

Servers SHOULD respond with the most specific content type:

```http
Content-Type: application/jrd+json; charset=utf-8
```

### Error Handling Standards

#### Standard HTTP Status Codes

**200 OK**: Successful discovery
```http
HTTP/1.1 200 OK
Content-Type: application/jrd+json
```

**400 Bad Request**: Malformed request
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "invalid_request",
  "error_description": "The resource parameter is malformed"
}
```

**404 Not Found**: Resource not found
```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": "resource_not_found",
  "error_description": "The requested resource does not exist"
}
```

**429 Too Many Requests**: Rate limiting
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 3600
Content-Type: application/json

{
  "error": "rate_limit_exceeded",
  "error_description": "Too many requests from this client"
}
```

### Legacy Protocol Support

#### OStatus Compatibility

For compatibility with older OStatus implementations:

```json
{
  "links": [
    {
      "rel": "http://schemas.google.com/g/2010#updates-from",
      "type": "application/atom+xml",
      "href": "https://example.com/users/alice/feed.atom"
    },
    {
      "rel": "salmon",
      "href": "https://example.com/users/alice/salmon"
    },
    {
      "rel": "magic-public-key",
      "href": "data:application/magic-public-key,RSA...."
    }
  ]
}
```

#### Diaspora Compatibility

For Diaspora protocol compatibility:

```json
{
  "links": [
    {
      "rel": "http://microformats.org/profile/hcard",
      "type": "text/html",
      "href": "https://example.com/hcard/users/alice"
    },
    {
      "rel": "http://joindiaspora.com/seed_location",
      "type": "text/html",
      "href": "https://example.com/"
    }
  ]
}
```

### Testing and Validation

#### WebFinger Validator

```javascript
class WebFingerValidator {
  async validateEndpoint(domain) {
    const testResource = `acct:test@${domain}`;
    const url = `https://${domain}/.well-known/webfinger?resource=${encodeURIComponent(testResource)}`;

    const results = {
      httpsSupport: false,
      corsSupport: false,
      validJRD: false,
      relFiltering: false,
      errors: []
    };

    try {
      // Test HTTPS requirement
      const response = await fetch(url);
      results.httpsSupport = url.startsWith('https://');

      // Test CORS headers
      results.corsSupport = response.headers.get('Access-Control-Allow-Origin') !== null;

      // Test JRD format
      if (response.ok) {
        const jrd = await response.json();
        results.validJRD = this.validateJRDStructure(jrd);
      }

      // Test rel filtering
      const filteredURL = `${url}&rel=self`;
      const filteredResponse = await fetch(filteredURL);
      if (filteredResponse.ok) {
        const filteredJRD = await filteredResponse.json();
        results.relFiltering = this.testRelFiltering(filteredJRD);
      }

    } catch (error) {
      results.errors.push(error.message);
    }

    return results;
  }

  validateJRDStructure(jrd) {
    return (
      typeof jrd === 'object' &&
      typeof jrd.subject === 'string' &&
      (jrd.aliases === undefined || Array.isArray(jrd.aliases)) &&
      (jrd.properties === undefined || typeof jrd.properties === 'object') &&
      (jrd.links === undefined || Array.isArray(jrd.links))
    );
  }

  testRelFiltering(jrd) {
    // Check if response was filtered (should only contain 'self' links)
    if (!jrd.links) return false;
    return jrd.links.every(link => link.rel === 'self');
  }
}
```

#### Compatibility Testing

```javascript
async function testCrossPlatformCompatibility(identifier) {
  const platforms = [
    { name: 'Mastodon', expectedRels: ['self', 'http://webfinger.net/rel/profile-page', 'http://ostatus.org/schema/1.0/subscribe'] },
    { name: 'Pleroma', expectedRels: ['self', 'http://webfinger.net/rel/profile-page', 'http://schemas.google.com/g/2010#updates-from'] },
    { name: 'Misskey', expectedRels: ['self', 'http://webfinger.net/rel/profile-page'] }
  ];

  const client = new WebFingerClient();
  const jrd = await client.discover(identifier);

  const compatibility = platforms.map(platform => {
    const foundRels = jrd.links.map(link => link.rel);
    const hasRequiredRels = platform.expectedRels.every(rel => foundRels.includes(rel));

    return {
      platform: platform.name,
      compatible: hasRequiredRels,
      missingRels: platform.expectedRels.filter(rel => !foundRels.includes(rel))
    };
  });

  return compatibility;
}
```

---

## Error Handling and Edge Cases

### HTTP Status Code Handling

#### Client-Side Error Handling

```javascript
class WebFingerErrorHandler {
  static async handleResponse(response, resource) {
    switch (response.status) {
      case 200:
        return await response.json();

      case 400:
        throw new WebFingerError(
          'Bad Request: Invalid resource parameter format',
          400,
          'invalid_resource'
        );

      case 404:
        throw new WebFingerError(
          `Resource not found: ${resource}`,
          404,
          'resource_not_found'
        );

      case 429:
        const retryAfter = response.headers.get('Retry-After');
        throw new WebFingerError(
          'Rate limit exceeded',
          429,
          'rate_limit_exceeded',
          { retryAfter: parseInt(retryAfter) || 3600 }
        );

      case 500:
        throw new WebFingerError(
          'Server error occurred',
          500,
          'server_error'
        );

      case 503:
        throw new WebFingerError(
          'Service temporarily unavailable',
          503,
          'service_unavailable'
        );

      default:
        throw new WebFingerError(
          `Unexpected status code: ${response.status}`,
          response.status,
          'unknown_error'
        );
    }
  }
}

class WebFingerError extends Error {
  constructor(message, status, code, metadata = {}) {
    super(message);
    this.name = 'WebFingerError';
    this.status = status;
    this.code = code;
    this.metadata = metadata;
  }

  isRetryable() {
    return [429, 500, 502, 503, 504].includes(this.status);
  }

  getRetryDelay() {
    if (this.status === 429 && this.metadata.retryAfter) {
      return this.metadata.retryAfter * 1000;
    }

    // Exponential backoff for server errors
    const baseDelay = 1000;
    const maxDelay = 60000;
    return Math.min(baseDelay * Math.pow(2, this.metadata.attempt || 0), maxDelay);
  }
}
```

#### Retry Logic Implementation

```javascript
class RetryableWebFingerClient {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseClient = new WebFingerClient(options);
  }

  async discoverWithRetry(resource, relations = []) {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.baseClient.discover(resource, relations);
      } catch (error) {
        lastError = error;

        if (!error.isRetryable() || attempt === this.maxRetries) {
          throw error;
        }

        const delay = error.getRetryDelay();
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Network Error Handling

#### Connection Failures

```javascript
async function handleNetworkErrors(url, options = {}) {
  const timeout = options.timeout || 5000;
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return response;

  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new WebFingerError(
        'Request timeout',
        0,
        'timeout'
      );
    }

    if (error.code === 'ENOTFOUND') {
      throw new WebFingerError(
        'DNS resolution failed',
        0,
        'dns_error'
      );
    }

    if (error.code === 'ECONNREFUSED') {
      throw new WebFingerError(
        'Connection refused',
        0,
        'connection_refused'
      );
    }

    throw new WebFingerError(
      `Network error: ${error.message}`,
      0,
      'network_error'
    );
  }
}
```

#### TLS/SSL Error Handling

```javascript
function handleTLSErrors(error) {
  if (error.code === 'CERT_HAS_EXPIRED') {
    throw new WebFingerError(
      'Server certificate has expired',
      0,
      'cert_expired'
    );
  }

  if (error.code === 'CERT_UNTRUSTED') {
    throw new WebFingerError(
      'Server certificate is not trusted',
      0,
      'cert_untrusted'
    );
  }

  if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    throw new WebFingerError(
      'Unable to verify server certificate',
      0,
      'cert_verification_failed'
    );
  }

  throw new WebFingerError(
    `TLS error: ${error.message}`,
    0,
    'tls_error'
  );
}
```

### Malformed Response Handling

#### JRD Validation and Sanitization

```javascript
class JRDValidator {
  static validate(jrd) {
    const errors = [];

    // Required subject field
    if (!jrd.subject || typeof jrd.subject !== 'string') {
      errors.push('Missing or invalid subject field');
    }

    // Validate aliases
    if (jrd.aliases !== undefined) {
      if (!Array.isArray(jrd.aliases)) {
        errors.push('aliases must be an array');
      } else {
        jrd.aliases.forEach((alias, index) => {
          if (typeof alias !== 'string') {
            errors.push(`alias[${index}] must be a string`);
          }
        });
      }
    }

    // Validate properties
    if (jrd.properties !== undefined) {
      if (typeof jrd.properties !== 'object' || Array.isArray(jrd.properties)) {
        errors.push('properties must be an object');
      }
    }

    // Validate links
    if (jrd.links !== undefined) {
      if (!Array.isArray(jrd.links)) {
        errors.push('links must be an array');
      } else {
        jrd.links.forEach((link, index) => {
          this.validateLink(link, index, errors);
        });
      }
    }

    if (errors.length > 0) {
      throw new WebFingerError(
        `Invalid JRD: ${errors.join(', ')}`,
        0,
        'invalid_jrd'
      );
    }

    return true;
  }

  static validateLink(link, index, errors) {
    if (typeof link !== 'object') {
      errors.push(`link[${index}] must be an object`);
      return;
    }

    if (!link.rel || typeof link.rel !== 'string') {
      errors.push(`link[${index}] missing or invalid rel property`);
    }

    if (link.href !== undefined && typeof link.href !== 'string') {
      errors.push(`link[${index}] href must be a string`);
    }

    if (link.type !== undefined && typeof link.type !== 'string') {
      errors.push(`link[${index}] type must be a string`);
    }

    if (link.titles !== undefined) {
      if (typeof link.titles !== 'object' || Array.isArray(link.titles)) {
        errors.push(`link[${index}] titles must be an object`);
      }
    }
  }

  static sanitize(jrd) {
    const sanitized = {
      subject: jrd.subject
    };

    if (jrd.aliases && Array.isArray(jrd.aliases)) {
      sanitized.aliases = jrd.aliases.filter(alias => typeof alias === 'string');
    }

    if (jrd.properties && typeof jrd.properties === 'object') {
      sanitized.properties = {};
      Object.keys(jrd.properties).forEach(key => {
        const value = jrd.properties[key];
        if (typeof value === 'string' || value === null) {
          sanitized.properties[key] = value;
        }
      });
    }

    if (jrd.links && Array.isArray(jrd.links)) {
      sanitized.links = jrd.links
        .filter(link => link && typeof link === 'object' && link.rel)
        .map(link => this.sanitizeLink(link));
    }

    return sanitized;
  }

  static sanitizeLink(link) {
    const sanitized = {
      rel: link.rel
    };

    if (typeof link.href === 'string') {
      sanitized.href = link.href;
    }

    if (typeof link.type === 'string') {
      sanitized.type = link.type;
    }

    if (link.titles && typeof link.titles === 'object') {
      sanitized.titles = {};
      Object.keys(link.titles).forEach(lang => {
        if (typeof link.titles[lang] === 'string') {
          sanitized.titles[lang] = link.titles[lang];
        }
      });
    }

    if (link.properties && typeof link.properties === 'object') {
      sanitized.properties = {};
      Object.keys(link.properties).forEach(key => {
        const value = link.properties[key];
        if (typeof value === 'string' || value === null) {
          sanitized.properties[key] = value;
        }
      });
    }

    return sanitized;
  }
}
```

### Edge Case Scenarios

#### Empty or Minimal Responses

```javascript
function handleMinimalResponse(jrd) {
  // Handle response with only subject
  if (Object.keys(jrd).length === 1 && jrd.subject) {
    return {
      ...jrd,
      links: [],
      aliases: [],
      properties: {}
    };
  }

  // Handle response with no links
  if (!jrd.links || jrd.links.length === 0) {
    console.warn('WebFinger response contains no links');
    return {
      ...jrd,
      links: []
    };
  }

  return jrd;
}
```

#### Large Response Handling

```javascript
class ResponseSizeValidator {
  static validate(response, maxSize = 1024 * 1024) { // 1MB default
    const contentLength = response.headers.get('content-length');

    if (contentLength && parseInt(contentLength) > maxSize) {
      throw new WebFingerError(
        'Response too large',
        0,
        'response_too_large'
      );
    }

    return true;
  }

  static async readLimitedResponse(response, maxSize = 1024 * 1024) {
    const reader = response.body.getReader();
    const chunks = [];
    let totalSize = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        totalSize += value.length;
        if (totalSize > maxSize) {
          throw new WebFingerError(
            'Response too large',
            0,
            'response_too_large'
          );
        }

        chunks.push(value);
      }

      const fullResponse = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of chunks) {
        fullResponse.set(chunk, offset);
        offset += chunk.length;
      }

      return new TextDecoder().decode(fullResponse);
    } finally {
      reader.releaseLock();
    }
  }
}
```

---

## Performance and Scalability

### Caching Strategies

#### Multi-Level Caching Architecture

```javascript
class WebFingerCacheManager {
  constructor(options = {}) {
    this.memoryCache = new Map();
    this.redisClient = options.redis;
    this.cdnCache = options.cdn;
    this.defaultTTL = options.ttl || 3600; // 1 hour
  }

  async get(key) {
    // Level 1: Memory cache
    const memoryResult = this.memoryCache.get(key);
    if (memoryResult && !this.isExpired(memoryResult)) {
      return memoryResult.data;
    }

    // Level 2: Redis cache
    if (this.redisClient) {
      const redisResult = await this.redisClient.get(`webfinger:${key}`);
      if (redisResult) {
        const data = JSON.parse(redisResult);
        this.setMemoryCache(key, data);
        return data;
      }
    }

    // Level 3: CDN cache (for public resources)
    if (this.cdnCache) {
      const cdnResult = await this.cdnCache.get(key);
      if (cdnResult) {
        this.setMemoryCache(key, cdnResult);
        if (this.redisClient) {
          await this.redisClient.setex(`webfinger:${key}`, this.defaultTTL, JSON.stringify(cdnResult));
        }
        return cdnResult;
      }
    }

    return null;
  }

  async set(key, data, ttl = this.defaultTTL) {
    // Set in all cache levels
    this.setMemoryCache(key, data, ttl);

    if (this.redisClient) {
      await this.redisClient.setex(`webfinger:${key}`, ttl, JSON.stringify(data));
    }

    if (this.cdnCache) {
      await this.cdnCache.set(key, data, ttl);
    }
  }

  setMemoryCache(key, data, ttl = this.defaultTTL) {
    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl * 1000
    });
  }

  isExpired(entry) {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  async invalidate(key) {
    this.memoryCache.delete(key);

    if (this.redisClient) {
      await this.redisClient.del(`webfinger:${key}`);
    }

    if (this.cdnCache) {
      await this.cdnCache.invalidate(key);
    }
  }
}
```

#### HTTP Caching Headers

```javascript
function setCacheHeaders(res, jrd, options = {}) {
  const maxAge = options.maxAge || 3600; // 1 hour
  const isPublic = options.public !== false;

  // Basic cache control
  const cacheControl = [
    isPublic ? 'public' : 'private',
    `max-age=${maxAge}`
  ];

  if (options.mustRevalidate) {
    cacheControl.push('must-revalidate');
  }

  res.setHeader('Cache-Control', cacheControl.join(', '));

  // ETag for conditional requests
  const etag = generateETag(jrd);
  res.setHeader('ETag', etag);

  // Last-Modified header
  if (options.lastModified) {
    res.setHeader('Last-Modified', options.lastModified.toUTCString());
  }

  // Vary header for content negotiation
  res.setHeader('Vary', 'Accept, Accept-Encoding');
}

function generateETag(jrd) {
  const crypto = require('crypto');
  const content = JSON.stringify(jrd);
  return `"${crypto.createHash('md5').update(content).digest('hex')}"`;
}
```

#### Conditional Request Handling

```javascript
function handleConditionalRequest(req, res, jrd, lastModified) {
  const ifNoneMatch = req.headers['if-none-match'];
  const ifModifiedSince = req.headers['if-modified-since'];

  const etag = generateETag(jrd);

  // Check ETag
  if (ifNoneMatch && ifNoneMatch === etag) {
    res.status(304).end();
    return true;
  }

  // Check Last-Modified
  if (ifModifiedSince && lastModified) {
    const clientDate = new Date(ifModifiedSince);
    if (lastModified <= clientDate) {
      res.status(304).end();
      return true;
    }
  }

  return false;
}
```

### Rate Limiting and Abuse Prevention

#### Advanced Rate Limiting

```javascript
class AdvancedRateLimiter {
  constructor(options = {}) {
    this.rules = options.rules || [
      { window: 60, limit: 60 },     // 60 requests per minute
      { window: 3600, limit: 1000 }, // 1000 requests per hour
      { window: 86400, limit: 10000 } // 10000 requests per day
    ];
    this.storage = options.storage || new Map();
  }

  async isAllowed(clientId, resource = null) {
    const now = Date.now();

    for (const rule of this.rules) {
      const key = `${clientId}:${rule.window}`;
      const windowStart = now - (rule.window * 1000);

      const requests = await this.getRequests(key, windowStart);

      if (requests.length >= rule.limit) {
        return {
          allowed: false,
          rule,
          retryAfter: Math.ceil((requests[0] + (rule.window * 1000) - now) / 1000)
        };
      }
    }

    // Record this request
    await this.recordRequest(clientId, now, resource);

    return { allowed: true };
  }

  async getRequests(key, windowStart) {
    const requests = await this.storage.get(key) || [];
    return requests.filter(timestamp => timestamp >= windowStart);
  }

  async recordRequest(clientId, timestamp, resource) {
    for (const rule of this.rules) {
      const key = `${clientId}:${rule.window}`;
      const requests = await this.getRequests(key, timestamp - (rule.window * 1000));
      requests.push(timestamp);
      await this.storage.set(key, requests);
    }

    // Track resource-specific requests
    if (resource) {
      const resourceKey = `${clientId}:resource:${resource}`;
      const resourceRequests = await this.storage.get(resourceKey) || [];
      resourceRequests.push(timestamp);
      await this.storage.set(resourceKey, resourceRequests);
    }
  }
}
```

#### Distributed Rate Limiting

```javascript
class DistributedRateLimiter {
  constructor(redisClient, options = {}) {
    this.redis = redisClient;
    this.prefix = options.prefix || 'webfinger:ratelimit';
    this.rules = options.rules || [
      { window: 60, limit: 60 },
      { window: 3600, limit: 1000 }
    ];
  }

  async isAllowed(clientId) {
    const pipeline = this.redis.pipeline();
    const now = Date.now();

    for (const rule of this.rules) {
      const key = `${this.prefix}:${clientId}:${rule.window}`;
      const windowStart = now - (rule.window * 1000);

      // Remove old entries and count current
      pipeline.zremrangebyscore(key, 0, windowStart);
      pipeline.zcard(key);
      pipeline.zadd(key, now, now);
      pipeline.expire(key, rule.window);
    }

    const results = await pipeline.exec();

    // Check each rule
    for (let i = 0; i < this.rules.length; i++) {
      const countResult = results[i * 4 + 1];
      const count = countResult[1];

      if (count >= this.rules[i].limit) {
        return {
          allowed: false,
          rule: this.rules[i],
          retryAfter: this.rules[i].window
        };
      }
    }

    return { allowed: true };
  }
}
```

### Database Optimization

#### Efficient User Lookup

```sql
-- Optimized database schema for WebFinger
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  avatar_url TEXT,
  profile_url TEXT,
  actor_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(username, domain)
);

-- Indexes for fast lookups
CREATE INDEX idx_users_username_domain ON users(username, domain);
CREATE INDEX idx_users_actor_url ON users(actor_url);

-- WebFinger aliases table
CREATE TABLE webfinger_aliases (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  alias_uri TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),

  PRIMARY KEY(user_id, alias_uri)
);

CREATE INDEX idx_webfinger_aliases_uri ON webfinger_aliases(alias_uri);

-- WebFinger properties table
CREATE TABLE webfinger_properties (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  property_name TEXT NOT NULL,
  property_value TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  PRIMARY KEY(user_id, property_name)
);

-- WebFinger links table
CREATE TABLE webfinger_links (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  rel TEXT NOT NULL,
  href TEXT,
  type TEXT,
  titles JSONB,
  properties JSONB,
  created_at TIMESTAMP DEFAULT NOW(),

  PRIMARY KEY(user_id, rel, href)
);

CREATE INDEX idx_webfinger_links_rel ON webfinger_links(rel);
```

#### Optimized Query Implementation

```javascript
class OptimizedWebFingerService {
  constructor(db) {
    this.db = db;
  }

  async resolveResource(resource) {
    // Parse resource identifier
    const { username, domain } = this.parseResource(resource);

    // Single query to get all user data
    const query = `
      SELECT
        u.id, u.username, u.domain, u.display_name, u.avatar_url, u.actor_url,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'alias', wa.alias_uri
            )
          ) FILTER (WHERE wa.alias_uri IS NOT NULL),
          '[]'
        ) as aliases,
        COALESCE(
          json_object_agg(
            wp.property_name, wp.property_value
          ) FILTER (WHERE wp.property_name IS NOT NULL),
          '{}'
        ) as properties,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'rel', wl.rel,
              'href', wl.href,
              'type', wl.type,
              'titles', wl.titles,
              'properties', wl.properties
            )
          ) FILTER (WHERE wl.rel IS NOT NULL),
          '[]'
        ) as links
      FROM users u
      LEFT JOIN webfinger_aliases wa ON u.id = wa.user_id
      LEFT JOIN webfinger_properties wp ON u.id = wp.user_id
      LEFT JOIN webfinger_links wl ON u.id = wl.user_id
      WHERE u.username = $1 AND u.domain = $2
      GROUP BY u.id
    `;

    const result = await this.db.query(query, [username, domain]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.buildJRD(result.rows[0], resource);
  }

  buildJRD(userData, resource) {
    const jrd = {
      subject: resource
    };

    // Add aliases
    if (userData.aliases && userData.aliases.length > 0) {
      jrd.aliases = userData.aliases
        .map(a => a.alias)
        .filter(alias => alias !== resource);
    }

    // Add properties
    if (userData.properties && Object.keys(userData.properties).length > 0) {
      jrd.properties = userData.properties;
    }

    // Add links
    if (userData.links && userData.links.length > 0) {
      jrd.links = userData.links.filter(link => link.rel);
    }

    return jrd;
  }

  parseResource(resource) {
    if (resource.startsWith('acct:')) {
      const [username, domain] = resource.replace('acct:', '').split('@');
      return { username, domain };
    }

    if (resource.startsWith('https://')) {
      const url = new URL(resource);
      const username = url.pathname.split('/').pop();
      return { username, domain: url.hostname };
    }

    throw new Error('Unsupported resource format');
  }
}
```

### Load Balancing and Scaling

#### Horizontal Scaling Architecture

```javascript
class WebFingerCluster {
  constructor(options = {}) {
    this.nodes = options.nodes || [];
    this.loadBalancer = options.loadBalancer || new RoundRobinBalancer();
    this.healthChecker = new HealthChecker(this.nodes);
  }

  async discover(resource, relations = []) {
    const availableNodes = await this.healthChecker.getHealthyNodes();

    if (availableNodes.length === 0) {
      throw new Error('No healthy nodes available');
    }

    const node = this.loadBalancer.selectNode(availableNodes);

    try {
      return await node.discover(resource, relations);
    } catch (error) {
      // Mark node as unhealthy and retry with another node
      this.healthChecker.markUnhealthy(node);

      const retryNodes = availableNodes.filter(n => n !== node);
      if (retryNodes.length > 0) {
        const retryNode = this.loadBalancer.selectNode(retryNodes);
        return await retryNode.discover(resource, relations);
      }

      throw error;
    }
  }
}

class RoundRobinBalancer {
  constructor() {
    this.currentIndex = 0;
  }

  selectNode(nodes) {
    if (nodes.length === 0) {
      throw new Error('No nodes available');
    }

    const node = nodes[this.currentIndex % nodes.length];
    this.currentIndex++;
    return node;
  }
}

class HealthChecker {
  constructor(nodes) {
    this.nodes = nodes;
    this.healthStatus = new Map();
    this.checkInterval = 30000; // 30 seconds

    this.startHealthChecks();
  }

  startHealthChecks() {
    setInterval(async () => {
      await this.checkAllNodes();
    }, this.checkInterval);
  }

  async checkAllNodes() {
    const checks = this.nodes.map(async (node) => {
      try {
        await node.healthCheck();
        this.healthStatus.set(node.id, true);
      } catch (error) {
        this.healthStatus.set(node.id, false);
      }
    });

    await Promise.allSettled(checks);
  }

  getHealthyNodes() {
    return this.nodes.filter(node =>
      this.healthStatus.get(node.id) !== false
    );
  }

  markUnhealthy(node) {
    this.healthStatus.set(node.id, false);
  }
}
```

#### CDN Integration

```javascript
class CDNWebFingerService {
  constructor(options = {}) {
    this.cdnEndpoint = options.cdnEndpoint;
    this.originService = options.originService;
    this.cacheTTL = options.cacheTTL || 3600;
  }

  async discover(resource, relations = []) {
    const cacheKey = this.generateCacheKey(resource, relations);

    try {
      // Try CDN first
      const cdnResponse = await this.fetchFromCDN(cacheKey);
      if (cdnResponse) {
        return cdnResponse;
      }
    } catch (error) {
      console.warn('CDN fetch failed:', error.message);
    }

    // Fallback to origin
    const originResponse = await this.originService.discover(resource, relations);

    // Cache in CDN for future requests
    await this.cacheInCDN(cacheKey, originResponse);

    return originResponse;
  }

  async fetchFromCDN(cacheKey) {
    const url = `${this.cdnEndpoint}/webfinger/${cacheKey}`;
    const response = await fetch(url);

    if (response.ok) {
      return await response.json();
    }

    if (response.status === 404) {
      return null; // Cache miss
    }

    throw new Error(`CDN error: ${response.status}`);
  }

  async cacheInCDN(cacheKey, data) {
    const url = `${this.cdnEndpoint}/webfinger/${cacheKey}`;

    await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `max-age=${this.cacheTTL}`
      },
      body: JSON.stringify(data)
    });
  }

  generateCacheKey(resource, relations) {
    const crypto = require('crypto');
    const input = `${resource}:${relations.sort().join(',')}`;
    return crypto.createHash('sha256').update(input).digest('hex');
  }
}
```

---

## Complete Technical Requirements

### Protocol Requirements

#### HTTPS Requirement (MUST)

**Mandatory HTTPS Usage**:
- WebFinger queries MUST be performed over HTTPS
- HTTP MUST NOT be supported for WebFinger endpoints
- Servers MUST reject HTTP requests to WebFinger endpoints
- Clients MUST NOT attempt HTTP fallback

**Implementation**:
```javascript
// Server-side HTTPS enforcement
app.use('/.well-known/webfinger', (req, res, next) => {
  if (!req.secure && req.get('X-Forwarded-Proto') !== 'https') {
    return res.status(400).json({
      error: 'https_required',
      error_description: 'WebFinger requires HTTPS'
    });
  }
  next();
});

// Client-side HTTPS enforcement
function validateWebFingerURL(url) {
  if (!url.startsWith('https://')) {
    throw new Error('WebFinger URLs must use HTTPS');
  }
}
```

#### Endpoint Requirements (MUST)

**Well-Known Path**:
- Path MUST be exactly `/.well-known/webfinger`
- Case-sensitive path matching
- No additional path components allowed

**HTTP Method Support**:
- GET method MUST be supported
- Other methods MAY return 405 Method Not Allowed
- HEAD method SHOULD be supported for resource existence checks

#### Query Parameter Requirements

**resource Parameter (REQUIRED)**:
- MUST be present in every WebFinger request
- MUST contain a valid URI identifying the resource
- MUST be properly percent-encoded
- Server MUST return 400 Bad Request if missing or malformed

**rel Parameter (OPTIONAL)**:
- MAY be included to filter response links
- Multiple rel parameters MAY be specified
- Server SHOULD filter links when rel parameters are present
- Server MAY ignore rel parameters and return all links

**Parameter Encoding**:
```javascript
// Correct parameter encoding
function buildWebFingerURL(host, resource, relations = []) {
  const baseURL = `https://${host}/.well-known/webfinger`;
  const params = new URLSearchParams();

  // Resource parameter (required)
  params.append('resource', resource);

  // Relation parameters (optional)
  relations.forEach(rel => params.append('rel', rel));

  return `${baseURL}?${params.toString()}`;
}
```

### Response Format Requirements

#### Content-Type Requirements (MUST)

**Primary Content Type**:
- MUST support `application/jrd+json`
- SHOULD include charset specification: `application/jrd+json; charset=utf-8`

**Alternative Content Types**:
- MAY support `application/json`
- MUST NOT serve other content types for WebFinger responses

**Content Negotiation**:
```http
Accept: application/jrd+json, application/json, */*;q=0.1
```

#### JRD Structure Requirements (MUST)

**Required Properties**:
- `subject`: MUST be present and contain the resource URI
- Other properties are OPTIONAL

**Property Validation**:
```javascript
function validateJRDStructure(jrd) {
  // Required subject
  if (!jrd.subject || typeof jrd.subject !== 'string') {
    throw new ValidationError('JRD must contain subject property');
  }

  // Optional aliases array
  if (jrd.aliases !== undefined && !Array.isArray(jrd.aliases)) {
    throw new ValidationError('aliases must be an array');
  }

  // Optional properties object
  if (jrd.properties !== undefined &&
      (typeof jrd.properties !== 'object' || Array.isArray(jrd.properties))) {
    throw new ValidationError('properties must be an object');
  }

  // Optional links array
  if (jrd.links !== undefined && !Array.isArray(jrd.links)) {
    throw new ValidationError('links must be an array');
  }

  return true;
}
```

#### Link Object Requirements

**Required Link Properties**:
- `rel`: MUST be present in every link object
- `rel`: MUST be either a registered link relation type or a URI

**Optional Link Properties**:
- `href`: Target URI for the link
- `type`: Media type of the linked resource
- `titles`: Localized titles for the link
- `properties`: Additional link metadata

**Link Validation**:
```javascript
function validateLinkObject(link) {
  if (!link.rel || typeof link.rel !== 'string') {
    throw new ValidationError('Link must have rel property');
  }

  if (link.href !== undefined && typeof link.href !== 'string') {
    throw new ValidationError('Link href must be a string');
  }

  if (link.type !== undefined && typeof link.type !== 'string') {
    throw new ValidationError('Link type must be a string');
  }

  if (link.titles !== undefined) {
    if (typeof link.titles !== 'object' || Array.isArray(link.titles)) {
      throw new ValidationError('Link titles must be an object');
    }
  }
}
```

### HTTP Status Code Requirements

#### Success Responses

**200 OK** (MUST):
- Successful resource discovery
- Valid JRD response body
- Appropriate cache headers

```http
HTTP/1.1 200 OK
Content-Type: application/jrd+json; charset=utf-8
Cache-Control: public, max-age=3600
Access-Control-Allow-Origin: *

{
  "subject": "acct:alice@example.com",
  "links": [...]
}
```

#### Client Error Responses

**400 Bad Request** (MUST):
- Missing or malformed resource parameter
- Invalid query parameter format
- Malformed request

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "invalid_request",
  "error_description": "The resource parameter is required"
}
```

**404 Not Found** (MUST):
- Resource does not exist
- Server has no information about the resource

```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": "resource_not_found",
  "error_description": "The requested resource was not found"
}
```

**405 Method Not Allowed** (SHOULD):
- Unsupported HTTP method
- Include Allow header with supported methods

```http
HTTP/1.1 405 Method Not Allowed
Allow: GET, HEAD
Content-Type: application/json

{
  "error": "method_not_allowed",
  "error_description": "Only GET and HEAD methods are supported"
}
```

**429 Too Many Requests** (SHOULD):
- Rate limiting exceeded
- Include Retry-After header

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 3600
Content-Type: application/json

{
  "error": "rate_limit_exceeded",
  "error_description": "Too many requests from this client"
}
```

#### Server Error Responses

**500 Internal Server Error** (MUST):
- Unexpected server errors
- Database connection failures
- Internal processing errors

**503 Service Unavailable** (SHOULD):
- Temporary service outages
- Maintenance mode
- Include Retry-After header when possible

### CORS Requirements (MUST)

#### Required CORS Headers

**Access-Control-Allow-Origin**:
- MUST include `Access-Control-Allow-Origin: *` for public resources
- MAY use specific origins for private resources

**Access-Control-Allow-Methods**:
- SHOULD include `Access-Control-Allow-Methods: GET, HEAD`

**Access-Control-Allow-Headers**:
- SHOULD include `Access-Control-Allow-Headers: Accept`

**Implementation**:
```javascript
function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Accept');
  res.setHeader('Access-Control-Max-Age', '3600');
}
```

### Security Requirements

#### TLS Requirements (MUST)

**Minimum TLS Version**:
- MUST support TLS 1.2 or higher
- SHOULD support TLS 1.3
- MUST NOT support SSL 3.0 or earlier
- MUST NOT support TLS 1.0 or 1.1

**Certificate Requirements**:
- MUST use valid TLS certificates
- MUST validate certificate chains
- SHOULD implement certificate pinning for critical services

#### Input Validation Requirements (MUST)

**Resource Parameter Validation**:
```javascript
function validateResourceParameter(resource) {
  // Check for valid URI format
  try {
    new URL(resource);
  } catch (error) {
    throw new ValidationError('Invalid resource URI format');
  }

  // Check for supported schemes
  const supportedSchemes = ['acct', 'http', 'https', 'mailto'];
  const scheme = resource.split(':')[0];

  if (!supportedSchemes.includes(scheme)) {
    throw new ValidationError(`Unsupported URI scheme: ${scheme}`);
  }

  // Prevent SSRF attacks
  if (scheme === 'http' || scheme === 'https') {
    const url = new URL(resource);
    if (isPrivateIP(url.hostname)) {
      throw new ValidationError('Private IP addresses not allowed');
    }
  }
}
```

#### Rate Limiting Requirements (SHOULD)

**Implementation Guidelines**:
- SHOULD implement per-IP rate limiting
- SHOULD implement per-resource rate limiting
- SHOULD use exponential backoff for repeated violations
- SHOULD log rate limiting events for monitoring

### Performance Requirements

#### Response Time Requirements (SHOULD)

**Target Response Times**:
- SHOULD respond within 500ms for cached responses
- SHOULD respond within 2 seconds for uncached responses
- SHOULD implement timeouts for external dependencies

#### Caching Requirements (SHOULD)

**HTTP Caching**:
- SHOULD include appropriate Cache-Control headers
- SHOULD support conditional requests (ETag, Last-Modified)
- SHOULD implement cache invalidation mechanisms

**Application Caching**:
- SHOULD cache frequently accessed resources
- SHOULD implement cache warming for popular resources
- SHOULD use distributed caching for scalability

### Monitoring and Logging Requirements

#### Logging Requirements (SHOULD)

**Access Logging**:
- SHOULD log all WebFinger requests
- SHOULD include client IP, resource, and response status
- SHOULD implement structured logging for analysis

**Error Logging**:
- MUST log all server errors with sufficient detail
- SHOULD log client errors for monitoring
- SHOULD implement log rotation and retention policies

**Security Logging**:
- SHOULD log rate limiting events
- SHOULD log suspicious request patterns
- SHOULD implement alerting for security events

#### Monitoring Requirements (SHOULD)

**Health Monitoring**:
- SHOULD implement health check endpoints
- SHOULD monitor response times and error rates
- SHOULD implement automated alerting

**Performance Monitoring**:
- SHOULD track cache hit rates
- SHOULD monitor database query performance
- SHOULD track resource discovery success rates

### Compliance and Testing Requirements

#### Specification Compliance (MUST)

**RFC 7033 Compliance**:
- MUST implement all MUST requirements from RFC 7033
- SHOULD implement all SHOULD requirements from RFC 7033
- MAY implement optional features and extensions

**Testing Requirements**:
- MUST test with various resource identifier formats
- MUST test error handling scenarios
- SHOULD implement automated compliance testing

#### Interoperability Testing (SHOULD)

**Cross-Platform Testing**:
- SHOULD test compatibility with major ActivityPub implementations
- SHOULD test with various WebFinger clients
- SHOULD participate in interoperability testing events

**Validation Tools**:
```javascript
class WebFingerComplianceValidator {
  async validateImplementation(baseURL) {
    const results = {
      httpsSupport: false,
      corsSupport: false,
      jrdFormat: false,
      errorHandling: false,
      relFiltering: false,
      errors: []
    };

    try {
      // Test HTTPS requirement
      results.httpsSupport = await this.testHTTPSRequirement(baseURL);

      // Test CORS support
      results.corsSupport = await this.testCORSSupport(baseURL);

      // Test JRD format
      results.jrdFormat = await this.testJRDFormat(baseURL);

      // Test error handling
      results.errorHandling = await this.testErrorHandling(baseURL);

      // Test rel filtering
      results.relFiltering = await this.testRelFiltering(baseURL);

    } catch (error) {
      results.errors.push(error.message);
    }

    return results;
  }

  async testHTTPSRequirement(baseURL) {
    // Test that HTTP is rejected
    const httpURL = baseURL.replace('https://', 'http://');
    try {
      await fetch(`${httpURL}/.well-known/webfinger?resource=acct:test@example.com`);
      return false; // Should have failed
    } catch (error) {
      return true; // Expected to fail
    }
  }

  async testCORSSupport(baseURL) {
    const response = await fetch(`${baseURL}/.well-known/webfinger?resource=acct:test@example.com`);
    return response.headers.get('Access-Control-Allow-Origin') !== null;
  }

  async testJRDFormat(baseURL) {
    const response = await fetch(`${baseURL}/.well-known/webfinger?resource=acct:test@example.com`);
    if (!response.ok) return false;

    const jrd = await response.json();
    return typeof jrd.subject === 'string';
  }

  async testErrorHandling(baseURL) {
    // Test missing resource parameter
    const response = await fetch(`${baseURL}/.well-known/webfinger`);
    return response.status === 400;
  }

  async testRelFiltering(baseURL) {
    const response = await fetch(`${baseURL}/.well-known/webfinger?resource=acct:test@example.com&rel=self`);
    if (!response.ok) return false;

    const jrd = await response.json();
    return jrd.links && jrd.links.every(link => link.rel === 'self');
  }
}
```

---

## Conclusion

WebFinger provides essential discovery capabilities for the modern social web, enabling seamless resource discovery across distributed systems. This comprehensive specification guide covers all aspects of WebFinger implementation, from basic protocol mechanics to advanced security and performance considerations.

### Key Implementation Points

1. **Security First**: Always use HTTPS, implement proper input validation, and include rate limiting
2. **Standards Compliance**: Follow RFC 7033 requirements strictly for interoperability
3. **Performance Optimization**: Implement caching strategies and efficient database queries
4. **Error Handling**: Provide clear error responses and graceful degradation
5. **ActivityPub Integration**: Support standard link relations for social web compatibility

### Best Practices Summary

- **Use HTTPS exclusively** for all WebFinger communications
- **Implement comprehensive caching** at multiple levels for performance
- **Support CORS headers** to enable web application access
- **Validate all inputs** to prevent security vulnerabilities
- **Monitor and log** for operational visibility and security
- **Test interoperability** with major implementations

### Future Considerations

WebFinger continues to evolve as part of the broader social web ecosystem. Implementers should stay current with:
- New link relation types for emerging protocols
- Security best practices and threat mitigation
- Performance optimization techniques
- Cross-platform compatibility requirements

For LLMs working with WebFinger-related queries, this guide provides the comprehensive technical foundation needed to understand, implement, and troubleshoot WebFinger deployments in modern distributed social networking systems.

---

*This guide is based on RFC 7033 (WebFinger) and current implementation practices in the ActivityPub ecosystem, providing practical guidance for developers building social web applications.*
