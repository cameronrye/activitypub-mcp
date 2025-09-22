# ActivityStreams Vocabulary Specification Guide for Large Language Models

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Conformance and Vocabulary Usage](#conformance-and-vocabulary-usage)
3. [Core Types Architecture](#core-types-architecture)
4. [Extended Activity Types](#extended-activity-types)
5. [Extended Actor Types](#extended-actor-types)
6. [Extended Object Types](#extended-object-types)
7. [Complete Properties Reference](#complete-properties-reference)
8. [JSON-LD Context and Extensibility](#json-ld-context-and-extensibility)
9. [Implementation Patterns](#implementation-patterns)
10. [Cross-Protocol Integration](#cross-protocol-integration)
11. [Common Use Cases and Scenarios](#common-use-cases-and-scenarios)
12. [Validation and Compliance](#validation-and-compliance)
13. [Internationalization and Accessibility](#internationalization-and-accessibility)
14. [Security Considerations](#security-considerations)
15. [Performance and Scalability](#performance-and-scalability)
16. [Interoperability Guidelines](#interoperability-guidelines)

---

## Executive Summary

### Purpose and Overview

The ActivityStreams Vocabulary is a W3C Recommendation (published May 23, 2017) that defines a comprehensive vocabulary for describing social activities, objects, and relationships in a machine-readable format. It serves as the foundational vocabulary for ActivityPub and other social web protocols, providing standardized terms for representing social interactions across distributed systems.

### Core Concepts

The ActivityStreams Vocabulary provides three fundamental categories of terms:

1. **Core Types**: Essential base types that form the foundation (Object, Link, Activity, Collection, etc.)
2. **Extended Types**: Specialized types for common social web scenarios (Create, Follow, Like, Person, Note, etc.)
3. **Properties**: Attributes that describe relationships and characteristics of objects and activities

### Key Components

- **Objects**: Content items, actors, and abstract entities
- **Activities**: Actions performed by actors on objects
- **Links**: References to external resources with metadata
- **Collections**: Ordered or unordered groups of objects
- **Properties**: Descriptive attributes and relationships

### Relationship to Other Specifications

- **ActivityPub**: Uses ActivityStreams as its core vocabulary and data model
- **JSON-LD**: Provides semantic web capabilities and extensibility framework
- **ActivityStreams 2.0 Core**: Defines the JSON syntax and serialization rules
- **Social Web Protocols**: Foundation for federated social networking standards

### Vocabulary Namespace

Base URI: `https://www.w3.org/ns/activitystreams#`

All ActivityStreams terms are defined within this namespace, enabling global identification and semantic interoperability.

---

## Conformance and Vocabulary Usage

### Specification Compliance

ActivityStreams implementations have different levels of vocabulary support:

#### Core Vocabulary Support
- **MUST**: Support serialization and deserialization of all Core Types
- **MUST**: Preserve unknown Extended Types during processing
- **SHOULD**: Implement Extended Types relevant to application domain
- **MAY**: Ignore Extended Types not relevant to implementation

#### Extension Requirements
- **MUST**: Use proper JSON-LD context for extensions
- **MUST NOT**: Redefine existing ActivityStreams terms
- **SHOULD**: Reuse existing terms before creating new ones
- **MAY**: Define domain-specific extensions

### Normative Language

The specification uses RFC 2119 key words:
- **MUST**: Absolute requirement for conformance
- **MUST NOT**: Absolute prohibition
- **SHOULD**: Recommended but not required
- **SHOULD NOT**: Not recommended but not prohibited
- **MAY**: Optional feature or behavior

### Vocabulary Extension Guidelines

**Implementations SHOULD**:
- Reuse existing ActivityStreams terms when semantically appropriate
- Define clear semantics for extension terms
- Provide JSON-LD context definitions for extensions
- Document extension terms and their intended usage

**Implementations MUST NOT**:
- Redefine the meaning of existing ActivityStreams terms
- Create extensions that conflict with core vocabulary semantics
- Use ActivityStreams namespace for non-standard terms

---

## Core Types Architecture

The ActivityStreams Core Types provide the foundational structure for all vocabulary terms. These eight types form the basis for all other vocabulary elements.

### Object Type

The base type for all ActivityStreams entities except Links.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Object",
  "id": "https://example.com/objects/1",
  "name": "A Simple Object",
  "summary": "This is a basic ActivityStreams object",
  "published": "2023-01-01T12:00:00Z",
  "attributedTo": "https://example.com/users/alice"
}
```

**Key Properties**:
- `id`: Unique identifier (IRI)
- `type`: Object type designation
- `name`: Display name or title
- `summary`: Brief description
- `content`: Main content (HTML allowed)
- `attributedTo`: Entity responsible for the object
- `published`: Publication timestamp
- `updated`: Last modification timestamp

### Link Type

Represents qualified references to external resources.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Link",
  "href": "https://example.com/resource",
  "rel": "related",
  "mediaType": "text/html",
  "name": "Related Resource",
  "hreflang": "en"
}
```

**Key Properties**:
- `href`: Target URL (required)
- `rel`: Link relationship type
- `mediaType`: MIME type of target resource
- `hreflang`: Language of target resource
- `height`/`width`: Dimensions for media links

### Activity Type

Describes actions performed by actors on objects.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Activity",
  "id": "https://example.com/activities/1",
  "summary": "Alice performed an action",
  "actor": "https://example.com/users/alice",
  "object": "https://example.com/objects/1",
  "published": "2023-01-01T12:00:00Z"
}
```

**Key Properties**:
- `actor`: Entity performing the activity
- `object`: Primary object of the activity
- `target`: Secondary object (destination)
- `result`: Result or outcome of the activity
- `origin`: Source or starting point
- `instrument`: Tool or means used

### IntransitiveActivity Type

Activities that don't have a direct object.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Arrive",
  "summary": "Alice arrived at work",
  "actor": "https://example.com/users/alice",
  "location": {
    "type": "Place",
    "name": "Office Building"
  },
  "published": "2023-01-01T09:00:00Z"
}
```

**Usage**: For activities like Arrive, Leave, Travel where the action doesn't have a direct object.

### Collection Type

Represents unordered groups of objects or links.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Collection",
  "id": "https://example.com/collections/1",
  "name": "Alice's Photos",
  "totalItems": 3,
  "items": [
    "https://example.com/photos/1",
    "https://example.com/photos/2",
    "https://example.com/photos/3"
  ]
}
```

### OrderedCollection Type

Collections where item order is significant.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "OrderedCollection",
  "id": "https://example.com/feeds/1",
  "name": "Alice's Activity Feed",
  "totalItems": 2,
  "orderedItems": [
    "https://example.com/activities/2",
    "https://example.com/activities/1"
  ]
}
```

### CollectionPage and OrderedCollectionPage Types

Used for paginating large collections.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "CollectionPage",
  "id": "https://example.com/collections/1?page=1",
  "partOf": "https://example.com/collections/1",
  "next": "https://example.com/collections/1?page=2",
  "items": [
    "https://example.com/objects/1",
    "https://example.com/objects/2"
  ]
}
```

**Pagination Properties**:
- `partOf`: Reference to parent collection
- `next`: Next page in sequence
- `prev`: Previous page in sequence
- `first`: First page of collection
- `last`: Last page of collection
- `startIndex`: Starting index for OrderedCollectionPage

---

## Extended Activity Types

Extended Activity Types represent common social web actions. All activity types inherit properties from the base Activity type.

### Content Management Activities

#### Create Activity
Publishing new content or objects.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Create",
  "id": "https://example.com/activities/create/1",
  "summary": "Alice created a note",
  "actor": "https://example.com/users/alice",
  "object": {
    "type": "Note",
    "id": "https://example.com/notes/1",
    "content": "Hello, ActivityStreams world!",
    "attributedTo": "https://example.com/users/alice"
  },
  "published": "2023-01-01T12:00:00Z",
  "to": ["https://www.w3.org/ns/activitystreams#Public"]
}
```

**Usage**: Creating posts, comments, media, documents, or any new content.

#### Update Activity
Modifying existing content.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Update",
  "summary": "Alice updated her profile",
  "actor": "https://example.com/users/alice",
  "object": {
    "type": "Person",
    "id": "https://example.com/users/alice",
    "name": "Alice Smith",
    "summary": "Updated biography"
  }
}
```

#### Delete Activity
Removing content or marking it as deleted.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Delete",
  "summary": "Alice deleted a note",
  "actor": "https://example.com/users/alice",
  "object": "https://example.com/notes/1"
}
```

### Social Interaction Activities

#### Follow Activity
Subscribing to another actor's activities.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Follow",
  "summary": "Alice followed Bob",
  "actor": "https://example.com/users/alice",
  "object": "https://example.com/users/bob"
}
```

#### Like Activity
Expressing approval or appreciation.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Like",
  "summary": "Alice liked Bob's note",
  "actor": "https://example.com/users/alice",
  "object": "https://example.com/notes/1"
}
```

#### Announce Activity
Sharing or amplifying content (equivalent to "repost" or "boost").

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Announce",
  "summary": "Alice shared Bob's note",
  "actor": "https://example.com/users/alice",
  "object": "https://example.com/notes/1",
  "to": ["https://example.com/users/alice/followers"]
}
```

### Response Activities

#### Accept Activity
Accepting invitations, follow requests, or proposals.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Accept",
  "summary": "Bob accepted Alice's follow request",
  "actor": "https://example.com/users/bob",
  "object": {
    "type": "Follow",
    "actor": "https://example.com/users/alice",
    "object": "https://example.com/users/bob"
  }
}
```

#### Reject Activity
Declining invitations, requests, or proposals.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Reject",
  "summary": "Bob rejected the invitation",
  "actor": "https://example.com/users/bob",
  "object": {
    "type": "Invite",
    "actor": "https://example.com/users/alice",
    "object": "https://example.com/events/1"
  }
}
```

### Collection Management Activities

#### Add Activity
Adding objects to collections.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Add",
  "summary": "Alice added a photo to her album",
  "actor": "https://example.com/users/alice",
  "object": "https://example.com/photos/1",
  "target": "https://example.com/albums/vacation"
}
```

#### Remove Activity
Removing objects from collections.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Remove",
  "summary": "Alice removed a photo from her album",
  "actor": "https://example.com/users/alice",
  "object": "https://example.com/photos/1",
  "target": "https://example.com/albums/vacation"
}
```

### Specialized Activities

#### Question Activity
Representing inquiries or polls.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Question",
  "summary": "What's your favorite color?",
  "actor": "https://example.com/users/alice",
  "oneOf": [
    {"name": "Red"},
    {"name": "Blue"},
    {"name": "Green"}
  ],
  "endTime": "2023-01-07T12:00:00Z"
}
```

#### Undo Activity
Reversing or canceling previous activities.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Undo",
  "summary": "Alice undid her like",
  "actor": "https://example.com/users/alice",
  "object": {
    "type": "Like",
    "id": "https://example.com/activities/like/1",
    "actor": "https://example.com/users/alice",
    "object": "https://example.com/notes/1"
  }
}
```

### Complete Activity Types List

**Content Management**: Create, Update, Delete
**Social Interaction**: Follow, Like, Dislike, Announce, Block, Ignore
**Response**: Accept, Reject, TentativeAccept, TentativeReject
**Collection Management**: Add, Remove, Move
**Group Management**: Join, Leave, Invite
**Content Experience**: Read, View, Listen
**Location**: Arrive, Leave, Travel
**Moderation**: Flag, Block
**Communication**: Offer, Question
**Correction**: Undo

Each activity type has specific semantic meaning and usage patterns that implementations should respect for interoperability.

---

## Extended Actor Types

Actor Types represent entities that can perform activities. All actor types inherit from the base Object type.

### Person Type

Represents individual human users.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Person",
  "id": "https://example.com/users/alice",
  "name": "Alice Smith",
  "preferredUsername": "alice",
  "summary": "Software developer and ActivityPub enthusiast",
  "icon": {
    "type": "Image",
    "url": "https://example.com/avatars/alice.jpg"
  },
  "image": {
    "type": "Image",
    "url": "https://example.com/banners/alice.jpg"
  },
  "inbox": "https://example.com/users/alice/inbox",
  "outbox": "https://example.com/users/alice/outbox",
  "followers": "https://example.com/users/alice/followers",
  "following": "https://example.com/users/alice/following"
}
```

**Common Properties**:
- `preferredUsername`: Handle or username
- `icon`: Profile picture/avatar
- `image`: Header or banner image
- `inbox`/`outbox`: ActivityPub endpoints
- `followers`/`following`: Social graph collections

### Organization Type

Represents companies, institutions, or formal groups.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Organization",
  "id": "https://example.com/orgs/acme",
  "name": "ACME Corporation",
  "summary": "Leading provider of innovative solutions",
  "url": "https://acme.example.com",
  "location": {
    "type": "Place",
    "name": "San Francisco, CA"
  }
}
```

### Service Type

Represents automated services, bots, or system accounts.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Service",
  "id": "https://example.com/services/bot",
  "name": "News Bot",
  "summary": "Automated news aggregation service",
  "icon": {
    "type": "Image",
    "url": "https://example.com/icons/bot.png"
  }
}
```

### Application Type

Represents software applications or clients.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Application",
  "id": "https://example.com/apps/mobile",
  "name": "Mobile Client",
  "summary": "Official mobile application",
  "url": "https://apps.example.com/mobile"
}
```

### Group Type

Represents collaborative groups or communities.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Group",
  "id": "https://example.com/groups/developers",
  "name": "ActivityPub Developers",
  "summary": "Community for ActivityPub developers",
  "members": "https://example.com/groups/developers/members",
  "moderators": "https://example.com/groups/developers/moderators"
}
```

---

## Extended Object Types

Object Types represent various kinds of content and entities in social systems.

### Content Object Types

#### Note Type
Short-form textual content (equivalent to "posts" or "status updates").

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "id": "https://example.com/notes/1",
  "content": "Just learned about ActivityStreams vocabulary! 🎉",
  "attributedTo": "https://example.com/users/alice",
  "published": "2023-01-01T12:00:00Z",
  "to": ["https://www.w3.org/ns/activitystreams#Public"],
  "tag": [
    {
      "type": "Hashtag",
      "name": "#ActivityStreams"
    }
  ]
}
```

#### Article Type
Long-form content with structured formatting.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Article",
  "id": "https://example.com/articles/1",
  "name": "Introduction to ActivityStreams",
  "content": "<h1>ActivityStreams Overview</h1><p>ActivityStreams is...</p>",
  "summary": "A comprehensive guide to ActivityStreams vocabulary",
  "attributedTo": "https://example.com/users/alice",
  "published": "2023-01-01T12:00:00Z"
}
```

#### Page Type
Web pages or documents.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Page",
  "id": "https://example.com/pages/about",
  "name": "About Us",
  "url": "https://example.com/about",
  "content": "Learn more about our organization..."
}
```

### Media Object Types

#### Image Type
Visual content including photos, graphics, and illustrations.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Image",
  "id": "https://example.com/images/1",
  "name": "Sunset Photo",
  "url": "https://example.com/media/sunset.jpg",
  "mediaType": "image/jpeg",
  "width": 1920,
  "height": 1080,
  "attributedTo": "https://example.com/users/alice"
}
```

#### Video Type
Video content including recordings and live streams.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Video",
  "id": "https://example.com/videos/1",
  "name": "ActivityPub Tutorial",
  "url": "https://example.com/media/tutorial.mp4",
  "mediaType": "video/mp4",
  "duration": "PT10M30S",
  "attributedTo": "https://example.com/users/alice"
}
```

#### Audio Type
Audio content including music, podcasts, and recordings.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Audio",
  "id": "https://example.com/audio/1",
  "name": "Podcast Episode 1",
  "url": "https://example.com/media/episode1.mp3",
  "mediaType": "audio/mpeg",
  "duration": "PT45M",
  "attributedTo": "https://example.com/users/alice"
}
```

### Specialized Object Types

#### Event Type
Scheduled events or activities.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Event",
  "id": "https://example.com/events/1",
  "name": "ActivityPub Meetup",
  "summary": "Monthly meetup for ActivityPub developers",
  "startTime": "2023-01-15T18:00:00Z",
  "endTime": "2023-01-15T20:00:00Z",
  "location": {
    "type": "Place",
    "name": "Community Center",
    "address": "123 Main St, San Francisco, CA"
  }
}
```

#### Place Type
Geographic locations or venues.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Place",
  "id": "https://example.com/places/1",
  "name": "Golden Gate Park",
  "latitude": 37.7694,
  "longitude": -122.4862,
  "radius": 1000,
  "address": "San Francisco, CA, USA"
}
```

#### Profile Type
Descriptive profiles for actors or objects.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Profile",
  "id": "https://example.com/profiles/1",
  "describes": "https://example.com/users/alice",
  "name": "Alice's Professional Profile",
  "summary": "Software engineer specializing in distributed systems"
}
```

#### Relationship Type
Describes relationships between entities.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Relationship",
  "id": "https://example.com/relationships/1",
  "subject": "https://example.com/users/alice",
  "relationship": "http://purl.org/vocab/relationship/friendOf",
  "object": "https://example.com/users/bob",
  "startTime": "2023-01-01T00:00:00Z"
}
```

#### Tombstone Type
Represents deleted objects.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Tombstone",
  "id": "https://example.com/notes/1",
  "formerType": "Note",
  "deleted": "2023-01-01T12:00:00Z",
  "summary": "This note has been deleted"
}
```

### Link Object Types

#### Mention Type
References to other actors within content.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Mention",
  "href": "https://example.com/users/bob",
  "name": "@bob"
}
```

#### Hashtag Type
Topical tags for categorization.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Hashtag",
  "href": "https://example.com/tags/activitypub",
  "name": "#activitypub"
}
```

---

## Complete Properties Reference

ActivityStreams properties define relationships and attributes for objects, activities, and links. Properties have specific domains (types they can be used with) and ranges (types of values they can have).

### Core Object Properties

#### id Property
**Domain**: Object | Link
**Range**: IRI
**Functional**: True

Provides a globally unique identifier for the object.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "id": "https://example.com/objects/123",
  "type": "Note"
}
```

#### type Property
**Domain**: Object | Link
**Range**: Object
**Functional**: False

Identifies the object type. Can be a single type or array of types.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": ["Note", "Article"],
  "name": "Hybrid Content"
}
```

#### name Property
**Domain**: Object | Link
**Range**: xsd:string | rdf:langString
**Functional**: False

Display name or title of the object. Supports internationalization.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "name": {
    "en": "Hello World",
    "es": "Hola Mundo",
    "fr": "Bonjour le Monde"
  }
}
```

#### content Property
**Domain**: Object
**Range**: xsd:string | rdf:langString
**Functional**: False

Main content of the object. May contain HTML markup.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "This is <strong>important</strong> content!",
  "mediaType": "text/html"
}
```

#### summary Property
**Domain**: Object
**Range**: xsd:string | rdf:langString
**Functional**: False

Brief description or abstract of the object.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Article",
  "name": "ActivityStreams Guide",
  "summary": "A comprehensive guide to ActivityStreams vocabulary"
}
```

### Attribution and Temporal Properties

#### attributedTo Property
**Domain**: Object | Link
**Range**: Object | Link
**Functional**: False

Identifies entities attributed with the creation of the object.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "Collaborative post",
  "attributedTo": [
    "https://example.com/users/alice",
    "https://example.com/users/bob"
  ]
}
```

#### published Property
**Domain**: Object
**Range**: xsd:dateTime
**Functional**: True

Timestamp when the object was first published.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "Hello world!",
  "published": "2023-01-01T12:00:00Z"
}
```

#### updated Property
**Domain**: Object
**Range**: xsd:dateTime
**Functional**: True

Timestamp when the object was last modified.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "Updated content",
  "published": "2023-01-01T12:00:00Z",
  "updated": "2023-01-01T13:30:00Z"
}
```

#### startTime Property
**Domain**: Object
**Range**: xsd:dateTime
**Functional**: True

Starting time for events or time-bounded activities.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Event",
  "name": "Conference",
  "startTime": "2023-06-01T09:00:00Z",
  "endTime": "2023-06-01T17:00:00Z"
}
```

#### endTime Property
**Domain**: Object
**Range**: xsd:dateTime
**Functional**: True

Ending time for events or time-bounded activities.

### Activity-Specific Properties

#### actor Property
**Domain**: Activity
**Range**: Object | Link
**Functional**: False

Identifies the entity performing the activity.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Create",
  "actor": "https://example.com/users/alice",
  "object": {
    "type": "Note",
    "content": "Hello world!"
  }
}
```

#### object Property
**Domain**: Activity
**Range**: Object | Link
**Functional**: False

Primary object of the activity.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Like",
  "actor": "https://example.com/users/alice",
  "object": "https://example.com/notes/1"
}
```

#### target Property
**Domain**: Activity
**Range**: Object | Link
**Functional**: False

Secondary object representing the destination or target.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Add",
  "actor": "https://example.com/users/alice",
  "object": "https://example.com/photos/1",
  "target": "https://example.com/albums/vacation"
}
```

#### result Property
**Domain**: Activity
**Range**: Object | Link
**Functional**: False

Result or outcome of the activity.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Question",
  "name": "What's your favorite color?",
  "oneOf": [{"name": "Red"}, {"name": "Blue"}],
  "result": {
    "type": "Note",
    "content": "Blue won with 60% of votes"
  }
}
```

#### origin Property
**Domain**: Activity
**Range**: Object | Link
**Functional**: False

Source or starting point of the activity.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Move",
  "actor": "https://example.com/users/alice",
  "object": "https://example.com/documents/1",
  "origin": "https://example.com/folders/drafts",
  "target": "https://example.com/folders/published"
}
```

#### instrument Property
**Domain**: Activity
**Range**: Object | Link
**Functional**: False

Tool or means used to perform the activity.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Create",
  "actor": "https://example.com/users/alice",
  "object": {
    "type": "Image",
    "name": "Digital Art"
  },
  "instrument": {
    "type": "Application",
    "name": "Photo Editor Pro"
  }
}
```

### Addressing Properties

#### to Property
**Domain**: Object
**Range**: Object | Link
**Functional**: False

Primary audience (public addressing).

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "Public announcement",
  "to": ["https://www.w3.org/ns/activitystreams#Public"]
}
```

#### cc Property
**Domain**: Object
**Range**: Object | Link
**Functional**: False

Secondary audience (public carbon copy).

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "Team update",
  "to": ["https://example.com/users/manager"],
  "cc": ["https://example.com/groups/team"]
}
```

#### bto Property
**Domain**: Object
**Range**: Object | Link
**Functional**: False

Primary audience (private addressing).

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "Private message",
  "bto": ["https://example.com/users/alice"]
}
```

#### bcc Property
**Domain**: Object
**Range**: Object | Link
**Functional**: False

Secondary audience (private carbon copy).

#### audience Property
**Domain**: Object
**Range**: Object | Link
**Functional**: False

Specific audience context for the object.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "Project update",
  "audience": {
    "type": "Group",
    "name": "Project Alpha Team"
  }
}
```

### Collection Properties

#### items Property
**Domain**: Collection
**Range**: Object | Link | Ordered List of Object | Link
**Functional**: False

Items contained in an unordered collection.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Collection",
  "name": "Photo Album",
  "totalItems": 3,
  "items": [
    "https://example.com/photos/1",
    "https://example.com/photos/2",
    "https://example.com/photos/3"
  ]
}
```

#### orderedItems Property
**Domain**: OrderedCollection
**Range**: Object | Link | Ordered List of Object | Link
**Functional**: False

Items in an ordered collection where sequence matters.

#### totalItems Property
**Domain**: Collection
**Range**: xsd:nonNegativeInteger
**Functional**: True

Total number of items in the collection.

#### first Property
**Domain**: Collection
**Range**: CollectionPage | Link
**Functional**: True

First page of a paginated collection.

#### last Property
**Domain**: Collection
**Range**: CollectionPage | Link
**Functional**: True

Last page of a paginated collection.

#### current Property
**Domain**: Collection
**Range**: CollectionPage | Link
**Functional**: True

Current or most recent page of a collection.

### Link Properties

#### href Property
**Domain**: Link
**Range**: xsd:anyURI
**Functional**: True

Target URL of the link (required for Link objects).

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Link",
  "href": "https://example.com/resource",
  "name": "External Resource"
}
```

#### rel Property
**Domain**: Link
**Range**: rfc5988 | xsd:string
**Functional**: False

Link relationship type as defined in RFC 5988.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Link",
  "href": "https://example.com/next",
  "rel": "next"
}
```

#### mediaType Property
**Domain**: Object | Link
**Range**: Mime Media Type
**Functional**: True

MIME media type of the resource.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Document",
  "url": "https://example.com/document.pdf",
  "mediaType": "application/pdf"
}
```

#### hreflang Property
**Domain**: Link
**Range**: BCP47 Language Tag
**Functional**: True

Language of the linked resource.

### Media and Dimension Properties

#### url Property
**Domain**: Object
**Range**: xsd:anyURI | Link
**Functional**: False

URL providing access to the object.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Video",
  "name": "Tutorial Video",
  "url": [
    {
      "type": "Link",
      "href": "https://example.com/video.mp4",
      "mediaType": "video/mp4"
    },
    {
      "type": "Link",
      "href": "https://example.com/video.webm",
      "mediaType": "video/webm"
    }
  ]
}
```

#### width Property
**Domain**: Object
**Range**: xsd:nonNegativeInteger
**Functional**: True

Width in pixels for media objects.

#### height Property
**Domain**: Object
**Range**: xsd:nonNegativeInteger
**Functional**: True

Height in pixels for media objects.

#### duration Property
**Domain**: Object
**Range**: xsd:duration
**Functional**: True

Duration for time-based media (ISO 8601 duration format).

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Audio",
  "name": "Podcast Episode",
  "duration": "PT1H30M45S"
}
```

### Relationship Properties

#### attachment Property
**Domain**: Object
**Range**: Object | Link
**Functional**: False

Objects attached to the main object.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "Check out these photos!",
  "attachment": [
    {
      "type": "Image",
      "url": "https://example.com/photo1.jpg"
    },
    {
      "type": "Image",
      "url": "https://example.com/photo2.jpg"
    }
  ]
}
```

#### tag Property
**Domain**: Object
**Range**: Object | Link
**Functional**: False

Tags associated with the object.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "Learning about #ActivityStreams with @alice",
  "tag": [
    {
      "type": "Hashtag",
      "name": "#ActivityStreams"
    },
    {
      "type": "Mention",
      "href": "https://example.com/users/alice",
      "name": "@alice"
    }
  ]
}
```

#### inReplyTo Property
**Domain**: Object
**Range**: Object | Link
**Functional**: False

Objects this object is responding to.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "Great point!",
  "inReplyTo": "https://example.com/notes/original"
}
```

#### location Property
**Domain**: Object
**Range**: Object | Link
**Functional**: False

Location associated with the object.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "Beautiful sunset!",
  "location": {
    "type": "Place",
    "name": "Golden Gate Bridge",
    "latitude": 37.8199,
    "longitude": -122.4783
  }
}
```

### Specialized Properties

#### subject Property
**Domain**: Relationship
**Range**: Object | Link
**Functional**: True

Subject of a relationship statement.

#### relationship Property
**Domain**: Relationship
**Range**: Object
**Functional**: False

Type of relationship between subject and object.

#### describes Property
**Domain**: Profile
**Range**: Object
**Functional**: True

Object described by a Profile.

#### formerType Property
**Domain**: Tombstone
**Range**: Object
**Functional**: False

Original type of a deleted object.

#### deleted Property
**Domain**: Tombstone
**Range**: xsd:dateTime
**Functional**: True

Timestamp when object was deleted.

---

## JSON-LD Context and Extensibility

### Standard Context

ActivityStreams uses JSON-LD for semantic web capabilities and extensibility. The standard context is:

```json
{
  "@context": "https://www.w3.org/ns/activitystreams"
}
```

### Extended Context

Applications can extend the vocabulary by adding custom context definitions:

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    {
      "customProperty": "https://example.com/ns#customProperty",
      "customType": "https://example.com/ns#CustomType"
    }
  ],
  "type": "customType",
  "customProperty": "custom value"
}
```

### Extension Best Practices

**Namespace Management**:
- Use proper URIs for custom terms
- Document extension semantics clearly
- Avoid conflicts with existing terms

**Compatibility**:
- Ensure extensions degrade gracefully
- Provide fallback behavior for unknown terms
- Test interoperability with standard implementations

**Semantic Clarity**:
- Define clear semantics for extension terms
- Use existing vocabularies when possible
- Provide JSON-LD context definitions

### Common Extension Patterns

**Custom Object Types**:
```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    {"Recipe": "https://schema.org/Recipe"}
  ],
  "type": "Recipe",
  "name": "Chocolate Chip Cookies",
  "recipeIngredient": ["flour", "sugar", "chocolate chips"]
}
```

**Custom Properties**:
```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    {"mood": "https://example.com/ns#mood"}
  ],
  "type": "Note",
  "content": "Having a great day!",
  "mood": "happy"
}
```

**Custom Activity Types**:
```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    {"Purchase": "https://example.com/ns#Purchase"}
  ],
  "type": "Purchase",
  "actor": "https://example.com/users/alice",
  "object": {
    "type": "Product",
    "name": "Book"
  }
}
```

---

## Implementation Patterns

### Object Creation Patterns

**Basic Object Creation**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "id": "https://example.com/notes/1",
  "content": "Hello world!",
  "attributedTo": "https://example.com/users/alice",
  "published": "2023-01-01T12:00:00Z"
}
```

**Rich Media Objects**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Article",
  "id": "https://example.com/articles/1",
  "name": "ActivityStreams Guide",
  "content": "<h1>Introduction</h1><p>ActivityStreams is...</p>",
  "summary": "A comprehensive guide",
  "attributedTo": "https://example.com/users/alice",
  "published": "2023-01-01T12:00:00Z",
  "attachment": [
    {
      "type": "Image",
      "url": "https://example.com/images/diagram.png",
      "name": "ActivityStreams Diagram"
    }
  ],
  "tag": [
    {"type": "Hashtag", "name": "#ActivityStreams"},
    {"type": "Hashtag", "name": "#SocialWeb"}
  ]
}
```

### Activity Patterns

**Content Creation Activity**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Create",
  "id": "https://example.com/activities/1",
  "actor": "https://example.com/users/alice",
  "object": {
    "type": "Note",
    "id": "https://example.com/notes/1",
    "content": "Hello world!",
    "attributedTo": "https://example.com/users/alice"
  },
  "published": "2023-01-01T12:00:00Z",
  "to": ["https://www.w3.org/ns/activitystreams#Public"]
}
```

**Social Interaction Activity**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Follow",
  "id": "https://example.com/activities/2",
  "actor": "https://example.com/users/alice",
  "object": "https://example.com/users/bob",
  "published": "2023-01-01T12:00:00Z"
}
```

### Collection Patterns

**Simple Collection**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Collection",
  "id": "https://example.com/collections/photos",
  "name": "Photo Album",
  "totalItems": 3,
  "items": [
    "https://example.com/photos/1",
    "https://example.com/photos/2",
    "https://example.com/photos/3"
  ]
}
```

**Paginated Collection**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "OrderedCollection",
  "id": "https://example.com/feeds/alice",
  "name": "Alice's Activity Feed",
  "totalItems": 150,
  "first": "https://example.com/feeds/alice?page=1",
  "last": "https://example.com/feeds/alice?page=15"
}
```

### Error Handling Patterns

**Graceful Degradation**:
```javascript
function processActivityStreamsObject(obj) {
  // Always check for required properties
  if (!obj.type) {
    throw new Error('Missing required type property');
  }

  // Handle unknown types gracefully
  const knownTypes = ['Note', 'Article', 'Image', 'Video'];
  if (!knownTypes.includes(obj.type)) {
    console.warn(`Unknown type: ${obj.type}, treating as generic Object`);
    obj.type = 'Object';
  }

  // Process known properties, ignore unknown ones
  return processKnownProperties(obj);
}
```

**Validation Patterns**:
```javascript
function validateActivityStreamsObject(obj) {
  const errors = [];

  // Check required properties
  if (!obj['@context']) {
    errors.push('Missing @context property');
  }

  if (!obj.type) {
    errors.push('Missing type property');
  }

  // Validate IRI format for id
  if (obj.id && !isValidIRI(obj.id)) {
    errors.push('Invalid IRI format for id property');
  }

  // Validate datetime format
  if (obj.published && !isValidDateTime(obj.published)) {
    errors.push('Invalid datetime format for published property');
  }

  return errors;
}
```

---

## Cross-Protocol Integration

### ActivityPub Integration

ActivityStreams serves as the core vocabulary for ActivityPub, providing the data model for federated social networking.

**Actor Object for ActivityPub**:
```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    "https://w3id.org/security/v1"
  ],
  "type": "Person",
  "id": "https://example.com/users/alice",
  "name": "Alice Smith",
  "preferredUsername": "alice",
  "inbox": "https://example.com/users/alice/inbox",
  "outbox": "https://example.com/users/alice/outbox",
  "followers": "https://example.com/users/alice/followers",
  "following": "https://example.com/users/alice/following",
  "publicKey": {
    "id": "https://example.com/users/alice#main-key",
    "owner": "https://example.com/users/alice",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----..."
  }
}
```

**ActivityPub Activity**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Create",
  "id": "https://example.com/activities/1",
  "actor": "https://example.com/users/alice",
  "object": {
    "type": "Note",
    "id": "https://example.com/notes/1",
    "content": "Hello, fediverse!",
    "attributedTo": "https://example.com/users/alice",
    "to": ["https://www.w3.org/ns/activitystreams#Public"],
    "cc": ["https://example.com/users/alice/followers"]
  },
  "published": "2023-01-01T12:00:00Z"
}
```

### Schema.org Integration

ActivityStreams can be combined with Schema.org vocabulary for richer semantic markup.

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    {"schema": "https://schema.org/"}
  ],
  "type": ["Event", "schema:Event"],
  "name": "ActivityPub Conference",
  "startTime": "2023-06-01T09:00:00Z",
  "endTime": "2023-06-01T17:00:00Z",
  "location": {
    "type": ["Place", "schema:Place"],
    "name": "Convention Center",
    "schema:address": {
      "schema:streetAddress": "123 Main St",
      "schema:addressLocality": "San Francisco",
      "schema:addressRegion": "CA"
    }
  }
}
```

### RSS/Atom Integration

ActivityStreams can represent traditional feed content with enhanced semantics.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "OrderedCollection",
  "name": "Blog Feed",
  "summary": "Latest blog posts",
  "orderedItems": [
    {
      "type": "Article",
      "name": "ActivityStreams Tutorial",
      "content": "Learn about ActivityStreams...",
      "published": "2023-01-01T12:00:00Z",
      "url": "https://example.com/blog/activitystreams-tutorial"
    }
  ]
}
```

---

## Common Use Cases and Scenarios

### Social Media Platform

**User Profile**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Person",
  "id": "https://social.example/users/alice",
  "name": "Alice Smith",
  "preferredUsername": "alice",
  "summary": "Software developer and open source enthusiast",
  "icon": {
    "type": "Image",
    "url": "https://social.example/avatars/alice.jpg"
  },
  "followers": "https://social.example/users/alice/followers",
  "following": "https://social.example/users/alice/following"
}
```

**Status Update**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Create",
  "actor": "https://social.example/users/alice",
  "object": {
    "type": "Note",
    "content": "Just deployed a new feature! 🚀 #coding #deployment",
    "tag": [
      {"type": "Hashtag", "name": "#coding"},
      {"type": "Hashtag", "name": "#deployment"}
    ],
    "to": ["https://www.w3.org/ns/activitystreams#Public"]
  }
}
```

**Photo Sharing**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Create",
  "actor": "https://social.example/users/alice",
  "object": {
    "type": "Image",
    "name": "Sunset at the beach",
    "url": "https://social.example/media/sunset.jpg",
    "location": {
      "type": "Place",
      "name": "Ocean Beach"
    },
    "to": ["https://www.w3.org/ns/activitystreams#Public"]
  }
}
```

### Content Management System

**Blog Post Publication**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Create",
  "actor": "https://blog.example/authors/alice",
  "object": {
    "type": "Article",
    "name": "Introduction to ActivityStreams",
    "content": "<h1>ActivityStreams Overview</h1><p>ActivityStreams is a vocabulary...</p>",
    "summary": "Learn the basics of ActivityStreams vocabulary",
    "published": "2023-01-01T12:00:00Z",
    "url": "https://blog.example/posts/activitystreams-intro",
    "tag": [
      {"type": "Hashtag", "name": "#ActivityStreams"},
      {"type": "Hashtag", "name": "#SocialWeb"}
    ]
  }
}
```

### Event Management

**Event Creation**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Create",
  "actor": "https://events.example/organizers/alice",
  "object": {
    "type": "Event",
    "name": "ActivityPub Meetup",
    "summary": "Monthly meetup for ActivityPub developers and enthusiasts",
    "startTime": "2023-02-15T18:00:00Z",
    "endTime": "2023-02-15T20:00:00Z",
    "location": {
      "type": "Place",
      "name": "Community Center",
      "address": "123 Main St, San Francisco, CA"
    },
    "url": "https://events.example/meetups/activitypub-feb"
  }
}
```

**Event RSVP**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Accept",
  "actor": "https://social.example/users/bob",
  "object": {
    "type": "Invite",
    "actor": "https://events.example/organizers/alice",
    "object": "https://events.example/meetups/activitypub-feb"
  }
}
```

### Collaborative Platform

**Document Collaboration**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Update",
  "actor": "https://collab.example/users/alice",
  "object": {
    "type": "Document",
    "name": "Project Proposal",
    "content": "Updated project timeline and budget estimates",
    "updated": "2023-01-01T14:30:00Z"
  },
  "target": {
    "type": "Collection",
    "name": "Project Alpha Documents"
  }
}
```

**Team Communication**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Create",
  "actor": "https://collab.example/users/alice",
  "object": {
    "type": "Note",
    "content": "Meeting notes from today's standup are now available",
    "attachment": {
      "type": "Document",
      "name": "Standup Notes - Jan 1",
      "url": "https://collab.example/docs/standup-jan1.pdf"
    }
  },
  "audience": {
    "type": "Group",
    "name": "Development Team"
  }
}
```

---

## Validation and Compliance

### JSON-LD Validation

**Context Validation**:
```javascript
function validateContext(obj) {
  const requiredContext = "https://www.w3.org/ns/activitystreams";

  if (!obj["@context"]) {
    return false;
  }

  if (typeof obj["@context"] === "string") {
    return obj["@context"] === requiredContext;
  }

  if (Array.isArray(obj["@context"])) {
    return obj["@context"].includes(requiredContext);
  }

  return false;
}
```

**Type Validation**:
```javascript
const CORE_TYPES = [
  'Object', 'Link', 'Activity', 'IntransitiveActivity',
  'Collection', 'OrderedCollection', 'CollectionPage', 'OrderedCollectionPage'
];

const ACTIVITY_TYPES = [
  'Accept', 'Add', 'Announce', 'Arrive', 'Block', 'Create', 'Delete',
  'Dislike', 'Flag', 'Follow', 'Ignore', 'Invite', 'Join', 'Leave',
  'Like', 'Listen', 'Move', 'Offer', 'Question', 'Reject', 'Read',
  'Remove', 'TentativeReject', 'TentativeAccept', 'Travel', 'Undo',
  'Update', 'View'
];

const ACTOR_TYPES = ['Application', 'Group', 'Organization', 'Person', 'Service'];

const OBJECT_TYPES = [
  'Article', 'Audio', 'Document', 'Event', 'Image', 'Note', 'Page',
  'Place', 'Profile', 'Relationship', 'Tombstone', 'Video'
];

function validateType(type) {
  const allTypes = [...CORE_TYPES, ...ACTIVITY_TYPES, ...ACTOR_TYPES, ...OBJECT_TYPES];
  return allTypes.includes(type);
}
```

### Property Validation

**Required Properties Check**:
```javascript
function validateRequiredProperties(obj) {
  const errors = [];

  // All objects should have @context and type
  if (!obj['@context']) {
    errors.push('Missing required @context property');
  }

  if (!obj.type) {
    errors.push('Missing required type property');
  }

  // Activities should have actor
  if (ACTIVITY_TYPES.includes(obj.type) && !obj.actor) {
    errors.push('Activity missing required actor property');
  }

  // Links should have href
  if (obj.type === 'Link' && !obj.href) {
    errors.push('Link missing required href property');
  }

  return errors;
}
```

**Property Domain/Range Validation**:
```javascript
function validatePropertyDomains(obj) {
  const errors = [];

  // Check activity-specific properties
  if (obj.actor && !ACTIVITY_TYPES.includes(obj.type)) {
    errors.push('actor property used outside Activity context');
  }

  if (obj.object && !ACTIVITY_TYPES.includes(obj.type)) {
    errors.push('object property used outside Activity context');
  }

  // Check collection-specific properties
  if (obj.items && obj.type !== 'Collection') {
    errors.push('items property used outside Collection context');
  }

  if (obj.orderedItems && obj.type !== 'OrderedCollection') {
    errors.push('orderedItems property used outside OrderedCollection context');
  }

  return errors;
}
```

### Compliance Testing

**Basic Compliance Test**:
```javascript
function testActivityStreamsCompliance(obj) {
  const results = {
    valid: true,
    errors: [],
    warnings: []
  };

  // Context validation
  if (!validateContext(obj)) {
    results.errors.push('Invalid or missing ActivityStreams context');
    results.valid = false;
  }

  // Type validation
  if (!validateType(obj.type)) {
    results.warnings.push(`Unknown type: ${obj.type}`);
  }

  // Required properties
  const requiredErrors = validateRequiredProperties(obj);
  results.errors.push(...requiredErrors);
  if (requiredErrors.length > 0) {
    results.valid = false;
  }

  // Property domains
  const domainErrors = validatePropertyDomains(obj);
  results.errors.push(...domainErrors);
  if (domainErrors.length > 0) {
    results.valid = false;
  }

  return results;
}
```

---

## Internationalization and Accessibility

### Language Support

**Multi-language Content**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "name": {
    "en": "Hello World",
    "es": "Hola Mundo",
    "fr": "Bonjour le Monde",
    "ja": "こんにちは世界"
  },
  "content": {
    "en": "This is a multilingual post",
    "es": "Esta es una publicación multilingüe",
    "fr": "Ceci est un post multilingue",
    "ja": "これは多言語の投稿です"
  }
}
```

**Language Detection**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "Bonjour tout le monde!",
  "contentMap": {
    "fr": "Bonjour tout le monde!"
  }
}
```

### Accessibility Features

**Alt Text for Media**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Image",
  "url": "https://example.com/sunset.jpg",
  "name": "Beautiful sunset over the ocean",
  "summary": "A vibrant orange and pink sunset reflecting on calm ocean waters"
}
```

**Content Warnings**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "summary": "Content Warning: Discussion of mental health",
  "content": "Sensitive content here...",
  "sensitive": true
}
```

---

## Security Considerations

### Content Validation

**Input Sanitization**:
```javascript
function sanitizeContent(content) {
  // Remove potentially dangerous HTML tags
  const allowedTags = ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li'];
  const allowedAttributes = ['href', 'title'];

  return sanitizeHtml(content, {
    allowedTags: allowedTags,
    allowedAttributes: allowedAttributes,
    allowedSchemes: ['http', 'https', 'mailto']
  });
}
```

**URL Validation**:
```javascript
function validateURL(url) {
  try {
    const parsed = new URL(url);
    // Only allow http and https schemes
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (e) {
    return false;
  }
}
```

### Privacy Protection

**Audience Validation**:
```javascript
function validateAudience(activity, actor) {
  // Ensure actor has permission to address specified audiences
  if (activity.to) {
    for (const recipient of activity.to) {
      if (!canActorAddress(actor, recipient)) {
        throw new Error(`Actor ${actor} cannot address ${recipient}`);
      }
    }
  }
}
```

**Private Content Handling**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "Private message content",
  "bto": ["https://example.com/users/alice"],
  "sensitive": true
}
```

---

## Performance and Scalability

### Efficient Collection Handling

**Pagination Strategy**:
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "OrderedCollection",
  "id": "https://example.com/feeds/alice",
  "totalItems": 10000,
  "first": {
    "type": "OrderedCollectionPage",
    "id": "https://example.com/feeds/alice?page=1",
    "orderedItems": ["...first 20 items..."],
    "next": "https://example.com/feeds/alice?page=2"
  }
}
```

**Lazy Loading**:
```javascript
async function loadCollection(collectionUrl, pageSize = 20) {
  const collection = await fetch(collectionUrl);

  if (collection.first) {
    // Load first page
    const firstPage = await fetch(collection.first);
    return firstPage.orderedItems || firstPage.items;
  }

  // Handle inline items
  return collection.orderedItems || collection.items || [];
}
```

### Caching Strategies

**Object Caching**:
```javascript
class ActivityStreamsCache {
  constructor(ttl = 3600000) { // 1 hour default TTL
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(id, object) {
    this.cache.set(id, {
      object: object,
      timestamp: Date.now()
    });
  }

  get(id) {
    const cached = this.cache.get(id);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(id);
      return null;
    }

    return cached.object;
  }
}
```

---

## Interoperability Guidelines

### Cross-Platform Compatibility

**Mastodon Compatibility**:
```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    {
      "toot": "http://joinmastodon.org/ns#",
      "sensitive": "as:sensitive"
    }
  ],
  "type": "Note",
  "content": "Post with content warning",
  "sensitive": true,
  "summary": "Content warning text"
}
```

**Pleroma/Akkoma Extensions**:
```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    {
      "pleroma": "http://pleroma.social/ns#",
      "emoji": "pleroma:emoji"
    }
  ],
  "type": "Note",
  "content": "Post with custom emoji :custom_emoji:",
  "emoji": {
    "custom_emoji": "https://example.com/emoji/custom.png"
  }
}
```

### Migration and Compatibility

**ActivityStreams 1.0 Migration**:
```javascript
function migrateFromAS1(as1Object) {
  const as2Object = {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: as1Object.objectType || "Object",
    id: as1Object.id,
    name: as1Object.displayName,
    content: as1Object.content,
    published: as1Object.published,
    updated: as1Object.updated
  };

  // Map AS1 actor to AS2 attributedTo
  if (as1Object.actor) {
    as2Object.attributedTo = as1Object.actor;
  }

  return as2Object;
}
```

### Best Practices Summary

**Implementation Guidelines**:
1. Always include proper `@context`
2. Use standard vocabulary terms when possible
3. Provide fallbacks for unknown types
4. Implement proper validation
5. Handle internationalization appropriately
6. Consider security implications
7. Design for scalability
8. Test interoperability with other implementations

**Common Pitfalls to Avoid**:
1. Missing required properties
2. Invalid IRI formats
3. Incorrect property domains
4. Poor error handling
5. Security vulnerabilities
6. Performance bottlenecks
7. Incompatible extensions

---

## Conclusion

The ActivityStreams Vocabulary provides a comprehensive foundation for representing social activities, objects, and relationships in a standardized, interoperable format. This guide has covered the complete vocabulary specification, implementation patterns, and best practices needed for successful ActivityStreams integration.

For LLMs working with ActivityStreams-related queries, this guide provides the essential vocabulary knowledge and practical examples needed to understand, generate, validate, and troubleshoot ActivityStreams objects and activities across various social web applications and protocols.

The vocabulary's extensibility through JSON-LD ensures it can adapt to evolving social web needs while maintaining backward compatibility and interoperability across different platforms and implementations.

---

*This guide is based on the W3C ActivityStreams Vocabulary Recommendation (May 23, 2017) and current implementation practices in the social web ecosystem.*

