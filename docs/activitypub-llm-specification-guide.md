# ActivityPub Specification Guide for Large Language Models

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Conformance and Profiles](#conformance-and-profiles)
3. [Core Architecture](#core-architecture)
4. [Technical Implementation Details](#technical-implementation-details)
5. [Data Models](#data-models)
6. [Complete Activity Reference](#complete-activity-reference)
7. [Protocol Flows](#protocol-flows)
8. [Delivery and Federation Details](#delivery-and-federation-details)
9. [Security Considerations](#security-considerations)
10. [Implementation Patterns](#implementation-patterns)
11. [Interoperability Guidelines](#interoperability-guidelines)
12. [Internationalization](#internationalization)
13. [Complete Technical Requirements](#complete-technical-requirements)

---

## Executive Summary

### Purpose and Overview

ActivityPub is a W3C Recommendation (published January 23, 2018) that defines a decentralized social networking protocol based on ActivityStreams 2.0. It enables federated social media platforms to communicate and share content across different servers and implementations.

### Core Concepts

ActivityPub provides two complementary layers:

1. **Server-to-Server Federation Protocol**: Enables decentralized websites to share information
2. **Client-to-Server Protocol**: Allows users, bots, and automated processes to interact with ActivityPub servers

### Key Components

- **Actors**: Represent users, organizations, or automated entities
- **Objects**: Content items (posts, images, videos, etc.)
- **Activities**: Actions performed by actors on objects (Create, Like, Follow, etc.)
- **Collections**: Ordered or unordered groups of objects or activities

### Relationship to Other Protocols

- **ActivityStreams 2.0**: Provides the vocabulary and data model
- **JSON-LD**: Enables semantic web capabilities and extensibility
- **WebFinger**: Used for actor discovery (though not required)
- **HTTP Signatures**: Common authentication mechanism for server-to-server communication
- **OAuth 2.0**: Standard for client-to-server authentication

---

## Conformance and Profiles

### Specification Profiles

ActivityPub defines three conformance classes that implementations can choose to support:

#### ActivityPub Conformant Client
- **Definition**: Implementation of the entirety of the client portion of the client-to-server protocol
- **Requirements**:
  - MUST support all client-side operations (POST to outbox, GET from inbox)
  - MUST handle authentication properly
  - MUST format activities according to ActivityStreams 2.0

#### ActivityPub Conformant Server
- **Definition**: Implementation of the entirety of the server portion of the client-to-server protocol
- **Requirements**:
  - MUST provide actor objects with required properties
  - MUST support inbox and outbox endpoints
  - MUST handle client authentication and authorization
  - MUST process activities according to specification

#### ActivityPub Conformant Federated Server
- **Definition**: Implementation of the entirety of the federation protocols
- **Requirements**:
  - MUST implement server-to-server delivery
  - MUST support activity forwarding rules
  - MUST handle remote actor discovery
  - MUST implement proper authentication for federation

### Normative Language

The specification uses RFC 2119 key words:
- **MUST**: Absolute requirement
- **MUST NOT**: Absolute prohibition
- **SHOULD**: Recommended but not required
- **SHOULD NOT**: Not recommended but not prohibited
- **MAY**: Optional

### Implementation Requirements

**Servers MUST**:
- Validate content to avoid spoofing attacks
- Include ActivityPub context in object definitions
- Follow URI/IRI conventions from ActivityStreams
- Implement proper HTTP status codes

**Servers SHOULD**:
- Include additional context as appropriate
- Implement robust verification mechanisms
- Support HTTP caching mechanisms
- Perform asynchronous delivery with retry logic

---

## Core Architecture

### Actor Model

Every user in ActivityPub is represented by an **Actor** object with these essential properties:

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Person",
  "id": "https://social.example/alyssa/",
  "name": "Alyssa P. Hacker",
  "preferredUsername": "alyssa",
  "summary": "Lisp enthusiast hailing from MIT",
  "inbox": "https://social.example/alyssa/inbox/",
  "outbox": "https://social.example/alyssa/outbox/",
  "followers": "https://social.example/alyssa/followers/",
  "following": "https://social.example/alyssa/following/",
  "liked": "https://social.example/alyssa/liked/"
}
```

### Core Endpoints

#### Inbox
- **Purpose**: Receives messages from other actors
- **GET**: Read incoming activities (client-to-server)
- **POST**: Deliver activities from other servers (server-to-server)

#### Outbox
- **Purpose**: Publishes activities to the world
- **GET**: Read actor's published activities
- **POST**: Submit new activities (client-to-server)

### Client-to-Server Protocol

The client-to-server protocol allows applications to:
- Create, update, and delete content
- Follow and unfollow other actors
- Like and share content
- Manage collections

### Server-to-Server Protocol

The federation protocol enables:
- Activity delivery between servers
- Distributed social graph maintenance
- Cross-server content sharing
- Federated authentication and authorization

---

## Technical Implementation Details

### HTTP Methods and Endpoints

#### Content Types
- **POST requests**: `application/ld+json; profile="https://www.w3.org/ns/activitystreams"`
- **GET requests**: Accept header with same content type
- **Alternative**: `application/activity+json` (equivalent for server-to-server)

#### Core HTTP Operations

**Actor Discovery**:
```http
GET /users/alice HTTP/1.1
Host: social.example
Accept: application/ld+json; profile="https://www.w3.org/ns/activitystreams"
```

**Activity Submission**:
```http
POST /users/alice/outbox HTTP/1.1
Host: social.example
Content-Type: application/ld+json; profile="https://www.w3.org/ns/activitystreams"
Authorization: Bearer <token>

{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Create",
  "actor": "https://social.example/users/alice",
  "object": {
    "type": "Note",
    "content": "Hello, world!"
  }
}
```

### Authentication Mechanisms

#### Client-to-Server Authentication
- **OAuth 2.0**: Recommended standard approach
- **Bearer tokens**: Most common implementation
- **API keys**: Alternative for trusted applications

#### Server-to-Server Authentication
- **HTTP Signatures**: Most widely adopted
- **Linked Data Signatures**: Alternative cryptographic approach
- **Mutual TLS**: For high-security environments

### Content Negotiation

ActivityPub supports multiple serialization formats:
- **JSON-LD**: Primary format with semantic capabilities
- **Plain JSON**: Simplified processing (ActivityStreams context assumed)
- **Other RDF formats**: For broader Linked Data compatibility

### Error Handling Patterns

Standard HTTP status codes with ActivityStreams error objects:

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Reject",
  "summary": "Access denied",
  "actor": "https://server.example/system",
  "object": {
    "type": "Follow",
    "id": "https://client.example/activities/123"
  }
}
```

Common error scenarios:
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource doesn't exist
- **410 Gone**: Resource deleted (with optional Tombstone)
- **422 Unprocessable Entity**: Invalid activity structure

---

## Data Models

### ActivityStreams Vocabulary

#### Core Object Types

**Actor Types**:
- `Person`: Individual users
- `Organization`: Companies, groups
- `Service`: Automated services, bots
- `Application`: Software applications

**Object Types**:
- `Note`: Short text posts
- `Article`: Long-form content
- `Image`, `Video`, `Audio`: Media objects
- `Document`: File attachments
- `Event`: Calendar events
- `Place`: Geographic locations

**Activity Types**:
- `Create`: Publishing new content
- `Update`: Modifying existing content
- `Delete`: Removing content
- `Follow`: Subscribing to an actor
- `Like`: Expressing approval
- `Announce`: Sharing/boosting content
- `Undo`: Reversing previous activities

#### Essential Properties

**Common to All Objects**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "id": "https://example.com/objects/123",
  "type": "Note",
  "attributedTo": "https://example.com/users/alice",
  "published": "2023-01-01T12:00:00Z",
  "updated": "2023-01-01T12:30:00Z"
}
```

**Addressing Properties**:
- `to`: Primary recipients (public)
- `cc`: Secondary recipients (public)
- `bto`: Primary recipients (private)
- `bcc`: Secondary recipients (private)
- `audience`: Specific audience targeting

**Content Properties**:
- `content`: HTML content
- `summary`: Plain text summary
- `name`: Object title
- `url`: Canonical URL
- `attachment`: Media attachments

### JSON-LD Context

ActivityPub uses JSON-LD for semantic web capabilities:

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    {
      "customProperty": "https://example.com/ns#customProperty"
    }
  ],
  "type": "Note",
  "customProperty": "custom value"
}
```

### Collection Types

**OrderedCollection**: Maintains item order
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "OrderedCollection",
  "totalItems": 3,
  "orderedItems": [
    "https://example.com/activities/1",
    "https://example.com/activities/2",
    "https://example.com/activities/3"
  ]
}
```

**Collection**: No guaranteed order
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Collection",
  "totalItems": 3,
  "items": [
    "https://example.com/activities/1",
    "https://example.com/activities/2",
    "https://example.com/activities/3"
  ]
}
```

---

## Complete Activity Reference

### Client-to-Server Activities

#### Create Activity

**Purpose**: Publishing new content to the actor's outbox

**Server Requirements**:
- MUST wrap non-activity objects in Create activities
- MUST assign unique IDs to created objects
- MUST add activity to actor's outbox collection
- MUST deliver to specified recipients

**Object Creation Without Create Activity**:
```json
POST /users/alice/outbox
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "Hello world",
  "to": ["https://www.w3.org/ns/activitystreams#Public"]
}
```

**Server Response** (wraps in Create):
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Create",
  "id": "https://social.example/activities/123",
  "actor": "https://social.example/users/alice",
  "object": {
    "type": "Note",
    "id": "https://social.example/objects/456",
    "attributedTo": "https://social.example/users/alice",
    "content": "Hello world",
    "to": ["https://www.w3.org/ns/activitystreams#Public"]
  }
}
```

#### Update Activity

**Client-to-Server Behavior**:
- Updates are **partial** - only provided key-value pairs are updated
- `null` values indicate field removal
- Only applies to top-level fields

**Server Requirements**:
- MUST modify object to reflect new structure
- MUST verify actor has permission to update
- MUST deliver complete updated object to federation

**Example Partial Update**:
```json
POST /users/alice/outbox
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Update",
  "object": {
    "id": "https://social.example/objects/456",
    "content": "Updated content",
    "summary": null
  }
}
```

#### Delete Activity

**Server Requirements**:
- MAY replace object with Tombstone
- SHOULD respond with 410 Gone for deleted objects
- MUST handle cascading deletions appropriately

**Tombstone Example**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "id": "https://social.example/objects/456",
  "type": "Tombstone",
  "published": "2023-01-01T12:00:00Z",
  "updated": "2023-01-01T12:00:00Z",
  "deleted": "2023-01-01T12:30:00Z"
}
```

#### Follow Activity

**Server Requirements**:
- SHOULD add object to actor's following collection only after Accept
- MUST deliver Follow to target actor's inbox
- MUST handle Accept/Reject responses appropriately

#### Add Activity

**Server Requirements**:
- SHOULD add object to specified target collection
- MUST verify target collection ownership
- MUST check authorization for collection modification

**Restrictions**:
- Target not owned by receiving server
- Object not allowed in target collection

#### Remove Activity

**Server Requirements**:
- SHOULD remove object from specified target collection
- MUST verify target collection ownership
- MUST check authorization for collection modification

#### Like Activity

**Server Requirements**:
- SHOULD add object to actor's liked collection
- MUST deliver Like to object's attributed actor
- SHOULD increment object's like count

#### Block Activity

**Server Requirements**:
- SHOULD prevent blocked actor from interacting with posting actor's objects
- MUST NOT deliver Block activities to their object
- SHOULD implement comprehensive blocking (replies, mentions, etc.)

#### Undo Activity

**Server Requirements**:
- MUST verify same actor for both Undo and original activity
- SHOULD reverse side effects of original activity
- MUST use specific inverse activities where they exist (Delete for Create, Remove for Add)

**Exceptions**:
- Use Delete instead of Undo for Create activities
- Use Remove instead of Undo for Add activities

### Server-to-Server Activities

#### Create Activity (Federation)

**Server Requirements**:
- SHOULD store local representation of activity and object
- MUST appear in recipient's inbox
- SHOULD validate object authenticity

#### Update Activity (Federation)

**Server Requirements**:
- MUST update local copy with complete replacement (not partial)
- MUST verify Update is authorized to modify object
- SHOULD ensure Update and object are from same origin

#### Delete Activity (Federation)

**Server Requirements**:
- SHOULD remove local representation of object
- MAY replace with Tombstone object
- MUST verify deletion authority

**Note**: No enforcement mechanism exists for remote deletion compliance

#### Follow Activity (Federation)

**Server Requirements**:
- SHOULD generate Accept or Reject activity
- MAY generate response automatically or after user review
- MAY choose not to send explicit Reject for privacy

**Accept Response**:
- SHOULD add actor to object actor's Followers collection

**Reject Response**:
- MUST NOT add actor to Followers collection

#### Accept Activity (Federation)

**For Follow Objects**:
- SHOULD add actor to receiver's Following collection

#### Reject Activity (Federation)

**For Follow Objects**:
- MUST NOT add actor to receiver's Following collection

#### Like Activity (Federation)

**Server Requirements**:
- SHOULD increment object's like count
- SHOULD add to object's likes collection if present

#### Announce Activity (Federation)

**Server Requirements**:
- SHOULD increment object's share count
- SHOULD add to object's shares collection if present

**Note**: Announce is equivalent to "sharing", "reposting", or "boosting"

---

## Protocol Flows

### Content Creation Flow

1. **Client submits content**:
```json
POST /users/alice/outbox
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "Hello, ActivityPub world!",
  "to": ["https://www.w3.org/ns/activitystreams#Public"]
}
```

2. **Server wraps in Create activity**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Create",
  "id": "https://social.example/activities/123",
  "actor": "https://social.example/users/alice",
  "published": "2023-01-01T12:00:00Z",
  "to": ["https://www.w3.org/ns/activitystreams#Public"],
  "object": {
    "type": "Note",
    "id": "https://social.example/objects/456",
    "attributedTo": "https://social.example/users/alice",
    "content": "Hello, ActivityPub world!",
    "published": "2023-01-01T12:00:00Z",
    "to": ["https://www.w3.org/ns/activitystreams#Public"]
  }
}
```

3. **Server delivers to recipients**:
   - Resolves recipient addresses
   - Delivers to follower inboxes
   - Handles public addressing

### Follow Relationship Flow

1. **Alice follows Bob**:
```json
POST /users/alice/outbox
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Follow",
  "actor": "https://social.example/users/alice",
  "object": "https://other.example/users/bob"
}
```

2. **Server delivers Follow to Bob's inbox**

3. **Bob's server responds with Accept**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Accept",
  "actor": "https://other.example/users/bob",
  "object": {
    "type": "Follow",
    "actor": "https://social.example/users/alice",
    "object": "https://other.example/users/bob"
  }
}
```

4. **Servers update collections**:
   - Alice added to Bob's followers
   - Bob added to Alice's following

### Federation Delivery Process

1. **Activity targeting**: Determine recipients from `to`, `cc`, `bto`, `bcc`, `audience`
2. **Inbox resolution**: Fetch actor objects to find inbox URLs
3. **Deduplication**: Remove duplicate recipients and self-references
4. **Delivery**: POST activity to each recipient inbox
5. **Retry logic**: Handle temporary failures with exponential backoff

---

## Delivery and Federation Details

### Core Delivery Requirements

**Federated servers MUST**:
- Perform delivery on all Activities posted to outbox
- Provide object property in activities: Create, Update, Delete, Follow, Add, Remove, Like, Block, Undo
- Provide target property for: Add, Remove activities
- Respect HTTP caching mechanisms

### Activity Targeting and Delivery

#### Recipient Determination

**Target Resolution Process**:
1. Extract recipients from `to`, `bto`, `cc`, `bcc`, `audience` fields
2. Resolve actor objects to find inbox URLs
3. Dereference collections to find individual actors
4. Limit collection indirection layers (MAY be one)
5. Deduplicate final recipient list
6. Exclude activity actor from recipients

#### Inbox Resolution

**Process**:
1. Retrieve target actor's JSON-LD representation
2. Extract inbox property from actor object
3. For Collections: dereference with user credentials
4. Discover inboxes for each collection item

**Collection Handling**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Collection",
  "items": [
    "https://server1.example/users/alice",
    "https://server2.example/users/bob"
  ]
}
```

#### Delivery Execution

**HTTP POST Requirements**:
- Content-Type: `application/ld+json; profile="https://www.w3.org/ns/activitystreams"`
- Authorization of submitting user
- Activity as request body
- Add to recipient's inbox OrderedCollection

**Error Handling**:
- 405 Method Not Allowed for non-federated servers
- Asynchronous delivery SHOULD be performed
- Retry on network errors with exponential backoff

### Outbox Delivery Requirements

**When objects are received in outbox, servers MUST target and deliver to**:
- `to`, `bto`, `cc`, `bcc`, `audience` fields if values are individuals or Collections owned by the actor
- Fields populated appropriately by posting client

### Inbox Forwarding (Ghost Replies Prevention)

**Forwarding Requirements**:
Servers MUST forward activities when ALL conditions are true:
1. First time server has seen this Activity
2. `to`, `cc`, `audience` contain Collection owned by server
3. `inReplyTo`, `object`, `target`, `tag` are objects owned by server
4. Server SHOULD recurse through linked objects with maximum limit
5. Server MUST only target original addressees, not new ones found during recursion

**Example Scenario**:
- Alyssa posts to followers collection (including Ben)
- Ben replies, including Alyssa's followers in recipients
- Ben's server can't see Alyssa's followers collection members
- Alyssa's server forwards Ben's reply to her followers
- Prevents "ghost replies" where followers see responses without original context

**Recursion Limits**:
- SHOULD set maximum recursion depth
- Prevents infinite loops in object references
- Balances completeness with performance

### Shared Inbox Delivery

**Purpose**:
- Reduce delivery load for servers with many actors
- Enable "known network" public message display
- Optimize follower delivery

**Shared Inbox Usage**:
- MAY reduce individual deliveries by using sharedInbox
- Identify followers sharing same sharedInbox
- Deliver once to shared endpoint instead of individual inboxes
- Remote server handles local distribution

**Public Addressing**:
- Objects addressed to Public collection
- MAY deliver to all known sharedInbox endpoints
- MUST still deliver to non-sharedInbox recipients

**Requirements**:
- Origin servers MUST deliver to actors without sharedInbox
- MUST deliver to collections not covered by sharedInbox
- Receiving server participates in targeting decisions

### Content Types and Negotiation

**Server-to-Server**:
- POST: `application/ld+json; profile="https://www.w3.org/ns/activitystreams"`
- GET: Accept header with same content type
- Alternative: `application/activity+json` (equivalent)

**Content Validation**:
- Servers SHOULD validate received content
- Check object appears as received at origin
- Verify signatures when available
- Prevent content spoofing attacks

### Federation Error Handling

**Network Errors**:
- Temporary failures: retry with exponential backoff
- Permanent failures: log and abandon
- Connection timeouts: treat as temporary
- DNS failures: treat as temporary

**HTTP Status Codes**:
- 2xx: Success, no retry needed
- 4xx: Client error, don't retry
- 5xx: Server error, retry with backoff
- 405: Non-federated server, don't retry

**Retry Strategy**:
```
Initial delay: 1 second
Maximum delay: 1 hour
Backoff factor: 2
Maximum attempts: 10
```

---

## Security Considerations

### Authentication and Authorization

**Client Authentication**:
- OAuth 2.0 with PKCE for public clients
- Client credentials flow for confidential clients
- Scope-based authorization (read, write, follow, etc.)

**Server Authentication**:
- HTTP Signatures for request verification
- Key rotation and management
- Certificate pinning for enhanced security

### Content Verification

**Origin Verification**:
```javascript
// Verify activity origin matches actor domain
const actorDomain = new URL(activity.actor).hostname;
const activityDomain = new URL(activity.id).hostname;
if (actorDomain !== activityDomain) {
  // Potential spoofing attempt
  throw new Error('Actor domain mismatch');
}
```

**Object Integrity**:
- Fetch referenced objects from origin
- Validate object signatures when available
- Check for content tampering

### Privacy and Access Control

**Addressing Validation**:
- Verify sender has permission to address recipients
- Respect private collection membership
- Handle `bto`/`bcc` privacy requirements

**Content Filtering**:
- Implement spam detection
- Content sanitization for XSS prevention
- Rate limiting for abuse prevention

### Complete Security Requirements

#### Authentication and Authorization

**Client-to-Server Authentication**:
- OAuth 2.0 recommended but not mandated
- Bearer tokens most common implementation
- API keys for trusted applications
- Scope-based authorization (read, write, follow)

**Server-to-Server Authentication**:
- HTTP Signatures widely adopted
- Linked Data Signatures alternative
- Mutual TLS for high-security environments
- Key rotation and management essential

#### Content Verification Requirements

**Origin Verification**:
- MUST verify activity origin matches actor domain
- SHOULD fetch referenced objects from origin
- MUST validate object signatures when available
- SHOULD check for content tampering

**Spoofing Prevention**:
```javascript
// Example verification
if (new URL(activity.actor).hostname !== new URL(activity.id).hostname) {
  throw new SecurityError('Actor domain mismatch');
}
```

#### Access Control Requirements

**Addressing Validation**:
- Verify sender permission to address recipients
- Respect private collection membership
- Handle `bto`/`bcc` privacy requirements
- Validate collection access rights

**Privacy Protection**:
- MUST remove `bto`/`bcc` during delivery
- SHOULD omit `bto`/`bcc` during display
- MUST NOT expose private collection members
- SHOULD implement follower enumeration protection

#### Vulnerability Mitigation

**Recursive Objects**:
- MUST set recursion limits for object resolution
- SHOULD detect circular references
- MUST prevent infinite loops
- MAY implement object depth limits

**Denial of Service Protection**:
- MUST implement rate limiting for federation
- SHOULD use exponential backoff for retries
- MUST limit collection page sizes
- SHOULD implement request timeouts

**Content Sanitization**:
- MUST sanitize HTML content for XSS prevention
- SHOULD validate media file types
- MUST escape user-generated content
- SHOULD implement content filtering

#### Network Security

**URI Scheme Restrictions**:
- SHOULD whitelist safe URI schemes (http, https)
- MUST NOT allow file:// scheme access
- SHOULD prevent localhost access in production
- MAY allow localhost for development with configuration

**TLS Requirements**:
- MUST use TLS 1.2 or higher
- SHOULD implement certificate pinning
- MUST validate certificate chains
- SHOULD use HSTS headers

#### Rate Limiting and Abuse Prevention

**Client Rate Limiting**:
- SHOULD implement per-client rate limits
- MUST prevent DoS attacks from clients
- SHOULD limit activity submission rates
- MAY implement adaptive rate limiting

**Federation Rate Limiting**:
- SHOULD implement per-server rate limits
- MUST prevent federation DoS attacks
- SHOULD limit concurrent connections
- MAY implement reputation-based limiting

**Spam Prevention**:
- SHOULD implement spam filtering
- MAY use content analysis
- SHOULD support user blocking
- MAY implement server-level blocking

#### Privacy and Data Protection

**Data Minimization**:
- SHOULD only collect necessary data
- MUST respect user privacy preferences
- SHOULD implement data retention policies
- MAY provide data export functionality

**Consent Management**:
- SHOULD obtain consent for data processing
- MUST respect user deletion requests
- SHOULD provide privacy controls
- MAY implement granular permissions

### Security Best Practices

**Development Security**:
- Use security-focused development practices
- Implement comprehensive input validation
- Regular security audits and testing
- Keep dependencies updated

**Operational Security**:
- Monitor for suspicious activity
- Implement logging and alerting
- Regular backup and recovery testing
- Incident response procedures

**User Security**:
- Provide security education
- Implement account security features
- Support strong authentication
- Clear privacy policies

---

## Implementation Patterns

### Server Architecture Patterns

**Microservices Approach**:
- Separate services for inbox/outbox processing
- Dedicated federation service
- Independent authentication service

**Monolithic Approach**:
- Single application handling all protocols
- Shared database and caching
- Simplified deployment and debugging

### Data Storage Patterns

**Activity Storage**:
```sql
CREATE TABLE activities (
  id UUID PRIMARY KEY,
  actor_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL,
  object_data JSONB,
  published TIMESTAMP,
  recipients TEXT[],
  FOREIGN KEY (actor_id) REFERENCES actors(id)
);
```

**Collection Management**:
- Paginated collections for performance
- Lazy loading of collection items
- Efficient follower/following storage

### Caching Strategies

**Actor Caching**:
- Cache actor objects with TTL
- Invalidate on profile updates
- Use ETags for conditional requests

**Activity Caching**:
- Cache public activities
- Respect cache headers from origin servers
- Implement cache warming for popular content

### Error Handling Patterns

**Graceful Degradation**:
```javascript
async function deliverActivity(activity, inbox) {
  try {
    await httpPost(inbox, activity);
  } catch (error) {
    if (error.status >= 400 && error.status < 500) {
      // Client error - don't retry
      logError('Permanent delivery failure', error);
    } else {
      // Server error - schedule retry
      scheduleRetry(activity, inbox, error);
    }
  }
}
```

**Retry Logic**:
- Exponential backoff for temporary failures
- Maximum retry limits
- Dead letter queues for persistent failures

### Performance Optimization

**Batch Processing**:
- Group deliveries by target server
- Batch database operations
- Parallel processing with concurrency limits

**Shared Inbox Optimization**:
- Deliver once to shared inboxes
- Reduce redundant network requests
- Optimize for large follower counts

---

## Interoperability Guidelines

### ActivityStreams Compatibility

**Core Vocabulary Usage**:
- Use standard ActivityStreams types when possible
- Extend vocabulary through JSON-LD contexts
- Maintain backward compatibility

**Property Handling**:
- Gracefully handle unknown properties
- Preserve extension data during processing
- Validate required properties

### Federation Best Practices

**Discovery Mechanisms**:
- Implement WebFinger for user discovery
- Support well-known endpoints
- Provide clear actor URLs

**Content Negotiation**:
- Support multiple content types
- Handle legacy format requests
- Provide appropriate fallbacks

### Cross-Platform Considerations

**Mastodon Compatibility**:
- Support Mastodon-specific extensions
- Handle character limits appropriately
- Implement expected behavior patterns

**Pleroma/Akkoma Compatibility**:
- Support emoji reactions
- Handle quote posts correctly
- Respect instance-specific features

**Other Platform Integration**:
- Bridge protocols (RSS, XMPP, Matrix)
- Import/export functionality
- Migration support

### Standards Compliance

**W3C Recommendation Adherence**:
- Follow specification requirements strictly
- Implement MUST/SHOULD requirements
- Document any deviations clearly

**HTTP Standards**:
- Proper status code usage
- Correct header handling
- Cache control implementation

**Security Standards**:
- TLS 1.2+ requirement
- Secure authentication flows
- Privacy protection measures

---

## Internationalization

### Language Support Requirements

**ActivityStreams Language Features**:
- Use `@language` property for content language specification
- Support multiple language variants of content
- Implement proper language negotiation

**Language Detection**:
- Difficult to determine language for user-submitted content
- W3C Internationalization group provides guidance
- MAY implement automatic language detection
- SHOULD allow user language specification

**Content Localization**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": {
    "en": "Hello world",
    "es": "Hola mundo",
    "fr": "Bonjour le monde"
  },
  "@language": "en"
}
```

**Implementation Guidelines**:
- Support Unicode text properly
- Handle right-to-left languages
- Implement proper text sorting
- Support international date/time formats

---

## Complete Technical Requirements

### Object Requirements

#### Object Identifiers
- Objects SHOULD have globally unique identifiers
- Identifiers MUST be valid URIs/IRIs
- SHOULD use HTTPS URIs for security
- MAY use fragment identifiers for sub-objects

#### Object Retrieval
- Objects MUST be retrievable via HTTP GET
- SHOULD support content negotiation
- MUST return appropriate HTTP status codes
- SHOULD implement caching headers

#### Source Property
- MAY include source property for original content
- Useful for content that has been processed/transformed
- SHOULD preserve original formatting information

### Actor Requirements

#### Required Properties
- `id`: Unique identifier (MUST)
- `type`: Actor type (MUST)
- `inbox`: Inbox endpoint (MUST)
- `outbox`: Outbox endpoint (SHOULD for federated actors)

#### Optional Properties
- `name`: Display name
- `preferredUsername`: Handle/username
- `summary`: Biography/description
- `icon`: Profile image
- `image`: Header/banner image
- `followers`: Followers collection
- `following`: Following collection
- `liked`: Liked objects collection
- `streams`: Additional activity streams
- `endpoints`: Additional endpoints (sharedInbox, etc.)

#### Actor Types
- `Person`: Individual users
- `Organization`: Companies, groups, institutions
- `Service`: Automated services, bots
- `Application`: Software applications
- `Group`: Collaborative groups

### Collection Requirements

#### Collection Types
- `Collection`: Unordered collection of objects
- `OrderedCollection`: Ordered collection of objects
- `CollectionPage`: Page of a collection
- `OrderedCollectionPage`: Page of an ordered collection

#### Required Properties
- `type`: Collection type (MUST)
- `totalItems`: Total number of items (SHOULD)

#### Pagination Requirements
- Large collections MUST be paginated
- Page size SHOULD be reasonable (typically 10-50 items)
- MUST provide navigation links (first, last, next, prev)
- SHOULD implement efficient pagination

#### Collection Modification
- Collections owned by actor MAY be modified
- External collections MUST NOT be modified
- SHOULD validate modification permissions

### HTTP Requirements

#### Status Codes
- `200 OK`: Successful retrieval
- `201 Created`: Successful creation
- `202 Accepted`: Accepted for processing
- `400 Bad Request`: Invalid request format
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `405 Method Not Allowed`: Method not supported
- `410 Gone`: Resource deleted
- `422 Unprocessable Entity`: Invalid activity
- `500 Internal Server Error`: Server error

#### Headers
- `Content-Type`: MUST be appropriate for content
- `Accept`: SHOULD specify preferred content types
- `Authorization`: MUST be included for authenticated requests
- `Cache-Control`: SHOULD implement appropriate caching
- `ETag`: MAY implement for conditional requests

#### Content Negotiation
- MUST support ActivityStreams JSON-LD
- SHOULD support alternative JSON-LD contexts
- MAY support other RDF serializations
- SHOULD provide appropriate fallbacks

### Media Upload Requirements

**Current Status**: Out of scope for ActivityPub 1.0
- Servers MAY support media upload
- No standardized mechanism specified
- Social Web Community Group developing extensions
- Common implementations use separate upload endpoints

**Typical Implementation**:
1. Upload media to dedicated endpoint
2. Receive media URL in response
3. Reference media URL in activity object
4. Server handles media storage and serving

### Error Handling Requirements

#### Client Errors (4xx)
- MUST provide clear error messages
- SHOULD include error codes for programmatic handling
- MAY include suggestions for correction
- MUST NOT expose sensitive information

#### Server Errors (5xx)
- SHOULD implement graceful degradation
- MUST log errors appropriately
- SHOULD provide generic error messages
- MAY implement automatic retry for clients

#### Federation Errors
- SHOULD handle remote server failures gracefully
- MUST implement appropriate retry logic
- SHOULD log federation issues
- MAY implement fallback mechanisms

### Performance Requirements

#### Caching
- SHOULD implement HTTP caching
- MUST respect cache headers from remote servers
- MAY implement application-level caching
- SHOULD cache frequently accessed objects

#### Scalability
- SHOULD implement efficient database queries
- MAY use read replicas for scaling
- SHOULD implement connection pooling
- MAY use CDNs for static content

#### Monitoring
- SHOULD implement performance monitoring
- MUST monitor federation health
- SHOULD track error rates
- MAY implement alerting systems

---

## Conclusion

ActivityPub provides a robust foundation for decentralized social networking through its dual-protocol approach and rich ActivityStreams vocabulary. Successful implementation requires careful attention to security, performance, and interoperability considerations while maintaining compliance with W3C standards.

For LLMs working with ActivityPub-related queries, this guide provides the essential technical details and implementation patterns needed to understand and assist with ActivityPub development, integration, and troubleshooting tasks.

---

*This guide is based on the W3C ActivityPub Recommendation (January 23, 2018) and current implementation practices in the fediverse.*
