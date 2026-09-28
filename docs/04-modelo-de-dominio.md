# 04 · Modelo de dominio (diagramas de clases UML)

Convenciones de los diagramas:

- `<<AggregateRoot>>`, `<<Entity>>`, `<<ValueObject>>`, `<<abstract>>`, `<<interface>>`,
  `<<enumeration>>` indican el estereotipo de cada clase.
- `-` privado, `#` protegido, `+` público; `$` método estático; `*` método abstracto.
- `Nullable~T~` = `T | null` (la **única** forma permitida de ausencia; ver
  [08-convenciones](08-convenciones-tipado-poo.md)). No existen atributos opcionales.
- Todo monto o cantidad usa `Decimal` (nunca `number`).
- Todas las entidades heredan de `Entity~TId~` y los agregados de `AggregateRoot~TId~`; para
  mantener los diagramas legibles la herencia del *kernel* se omite fuera del diagrama 1.

## 1. Núcleo compartido (`libs/shared/kernel`)

```mermaid
classDiagram
    direction TB
    class Entity~TId~ {
        <<abstract>>
        #TId id
        +getId() TId
        +equals(other Entity~TId~) boolean
    }
    class AggregateRoot~TId~ {
        <<abstract>>
        -DomainEvent[] pendingEvents
        #record(event DomainEvent) void
        +pullDomainEvents() DomainEvent[]
    }
    class ValueObject~TProps~ {
        <<abstract>>
        #TProps props
        +equals(other ValueObject~TProps~) boolean
    }
    class EntityId {
        <<ValueObject>>
        -string value
        +generate()$ EntityId
        +fromString(raw string)$ Result~EntityId~
        +toString() string
    }
    class DomainEvent {
        <<abstract>>
        +EntityId aggregateId
        +Date occurredAt
        +eventName()* string
    }
    class Optional~T~ {
        <<abstract>>
        +of(value T)$ Optional~T~
        +empty()$ Optional~T~
        +fromNullable(value Nullable~T~)$ Optional~T~
        +isPresent()* boolean
        +map(mapper Mapper~T,R~)* Optional~R~
        +orElse(fallback T)* T
        +orElseThrow(factory ErrorFactory)* T
    }
    class Present~T~
    class Empty~T~
    class Result~T~ {
        <<abstract>>
        +ok(value T)$ Result~T~
        +fail(error DomainError)$ Result~T~
        +isOk()* boolean
        +map(mapper Mapper~T,R~)* Result~R~
        +flatMap(mapper Mapper~T,Result~R~~)* Result~R~
        +unwrap()* T
    }
    class Ok~T~
    class Fail~T~
    class DomainError {
        <<abstract>>
        +string code
        +string message
        +httpStatus()* number
    }
    class ValidationError
    class NotFoundError
    class ForbiddenError
    class ConflictError
    class Decimal {
        <<ValueObject>>
        -DecimalJs value
        +of(raw string)$ Result~Decimal~
        +zero()$ Decimal
        +add(other Decimal) Decimal
        +subtract(other Decimal) Decimal
        +multiply(other Decimal) Decimal
        +divide(other Decimal) Result~Decimal~
        +negate() Decimal
        +isNegative() boolean
        +round(places number, mode RoundingMode) Decimal
        +toString() string
    }
    class Money {
        <<ValueObject>>
        -Decimal amount
        -CurrencyCode currency
        +add(other Money) Result~Money~
        +convert(rate Decimal, target CurrencyCode) Money
    }
    class Period {
        <<ValueObject>>
        -number year
        -number month
        +of(year number, month number)$ Result~Period~
        +previous() Period
        +startOfYear(fiscalStartMonth number) Period
        +isBefore(other Period) boolean
        +rangeTo(other Period) Period[]
    }
    class Clock {
        <<abstract>>
        +now()* Date
    }

    Entity~TId~ <|-- AggregateRoot~TId~
    AggregateRoot~TId~ o-- DomainEvent
    Optional~T~ <|-- Present~T~
    Optional~T~ <|-- Empty~T~
    Result~T~ <|-- Ok~T~
    Result~T~ <|-- Fail~T~
    Fail~T~ --> DomainError
    DomainError <|-- ValidationError
    DomainError <|-- NotFoundError
    DomainError <|-- ForbiddenError
    DomainError <|-- ConflictError
    ValueObject~TProps~ <|-- EntityId
    ValueObject~TProps~ <|-- Decimal
    ValueObject~TProps~ <|-- Money
    ValueObject~TProps~ <|-- Period
    Money *-- Decimal
```

## 2. Identidad y seguridad (`iam`)

```mermaid
classDiagram
    class User {
        <<AggregateRoot>>
        -EntityId id
        -Email email
        -PasswordHash passwordHash
        -UserProfile profile
        -UserStatus status
        -TwoFactorSettings twoFactor
        -LoginSecurityState security
        -Date createdAt
        -Nullable~Date~ lastLoginAt
        +register(email Email, hash PasswordHash, profile UserProfile)$ User
        +verifyEmail(clock Clock) void
        +changePassword(hash PasswordHash) void
        +recordFailedLogin(policy LockoutPolicy, clock Clock) void
        +recordSuccessfulLogin(clock Clock) void
        +isLocked(clock Clock) boolean
        +enableTwoFactor(secret EncryptedSecret, codes RecoveryCode[]) void
        +disableTwoFactor() void
        +updateProfile(profile UserProfile) void
    }
    class Email {
        <<ValueObject>>
        -string value
        +create(raw string)$ Result~Email~
    }
    class PasswordHash {
        <<ValueObject>>
        -string value
    }
    class UserProfile {
        <<ValueObject>>
        -string displayName
        -Nullable~EntityId~ avatarFileId
        -Locale locale
        -string timeZone
    }
    class TwoFactorSettings {
        <<ValueObject>>
        -boolean enabled
        -Nullable~EncryptedSecret~ secret
        -RecoveryCode[] recoveryCodes
        +disabled()$ TwoFactorSettings
    }
    class LoginSecurityState {
        <<ValueObject>>
        -number failedAttempts
        -number lockoutCount
        -Nullable~Date~ lockedUntil
    }
    class LockoutPolicy {
        <<ValueObject>>
        -number maxAttempts
        -number baseLockMinutes
        +lockDurationFor(lockoutCount number) number
    }
    class UserStatus {
        <<enumeration>>
        PENDING_VERIFICATION
        ACTIVE
        LOCKED
        DISABLED
    }
    class Session {
        <<AggregateRoot>>
        -EntityId id
        -EntityId userId
        -DeviceInfo device
        -EntityId refreshFamilyId
        -Date createdAt
        -Date lastSeenAt
        -Nullable~Date~ revokedAt
        +touch(clock Clock) void
        +revoke(clock Clock) void
        +isActive() boolean
    }
    class RefreshToken {
        <<Entity>>
        -EntityId id
        -EntityId sessionId
        -EntityId familyId
        -TokenHash hash
        -Date expiresAt
        -Nullable~Date~ usedAt
        -Nullable~EntityId~ replacedBy
        +rotate(next RefreshToken, clock Clock) Result~RefreshToken~
        +wasAlreadyUsed() boolean
    }
    class OneTimeToken {
        <<Entity>>
        -EntityId userId
        -TokenPurpose purpose
        -TokenHash hash
        -Date expiresAt
        -Nullable~Date~ consumedAt
        +consume(clock Clock) Result~OneTimeToken~
    }
    class TokenPurpose {
        <<enumeration>>
        EMAIL_VERIFICATION
        PASSWORD_RESET
        TWO_FACTOR_CHALLENGE
    }
    class PasswordHasher {
        <<abstract>>
        +hash(plain PlainPassword)* Promise~PasswordHash~
        +verify(plain PlainPassword, hash PasswordHash)* Promise~boolean~
    }
    class Argon2PasswordHasher
    class AccessTokenIssuer {
        <<abstract>>
        +issue(principal AuthenticatedPrincipal)* AccessToken
        +verify(raw string)* Result~AuthenticatedPrincipal~
    }
    class JwtAccessTokenIssuer
    class AuthenticationService {
        -UserRepository users
        -SessionRepository sessions
        -PasswordHasher hasher
        -AccessTokenIssuer issuer
        -RefreshTokenService refreshTokens
        -SecurityAuditLogger audit
        +login(command LoginCommand) Promise~Result~LoginOutcome~~
        +completeTwoFactor(command TwoFactorCommand) Promise~Result~LoginOutcome~~
        +refresh(raw RefreshTokenValue) Promise~Result~LoginOutcome~~
        +logout(sessionId EntityId) Promise~void~
    }
    class LoginOutcome {
        <<abstract>>
    }
    class AuthenticatedLogin {
        +AccessToken accessToken
        +RefreshTokenValue refreshToken
    }
    class TwoFactorRequired {
        +ChallengeToken challenge
    }
    class SecurityAuditEntry {
        <<Entity>>
        -Nullable~EntityId~ userId
        -SecurityEventType type
        -string ipAddress
        -string userAgent
        -Date occurredAt
    }
    class UserRepository {
        <<abstract>>
        +findById(id EntityId)* Promise~Optional~User~~
        +findByEmail(email Email)* Promise~Optional~User~~
        +save(user User)* Promise~void~
    }

    User *-- Email
    User *-- PasswordHash
    User *-- UserProfile
    User *-- TwoFactorSettings
    User *-- LoginSecurityState
    User --> UserStatus
    User ..> LockoutPolicy
    User "1" --> "0..*" Session : abre
    Session "1" *-- "1..*" RefreshToken : familia
    User "1" --> "0..*" OneTimeToken
    OneTimeToken --> TokenPurpose
    PasswordHasher <|-- Argon2PasswordHasher
    AccessTokenIssuer <|-- JwtAccessTokenIssuer
    AuthenticationService --> UserRepository
    AuthenticationService --> PasswordHasher
    AuthenticationService --> AccessTokenIssuer
    AuthenticationService ..> LoginOutcome
    LoginOutcome <|-- AuthenticatedLogin
    LoginOutcome <|-- TwoFactorRequired
    AuthenticationService ..> SecurityAuditEntry : registra
```

## 3. Proyectos y control de acceso (`projects`, `access-control`)

```mermaid
classDiagram
    class Project {
        <<abstract>>
        -EntityId id
        -ProjectName name
        -string description
        -EntityId ownerId
        -ProjectStatus status
        -Date createdAt
        +rename(name ProjectName) void
        +archive() void
        +transferOwnership(newOwner EntityId) Result~Project~
        +moduleType()* ModuleType
    }
    class ReportProject {
        -ReportProjectSettings settings
        +moduleType() ModuleType
    }
    class InventoryProject {
        -InventoryProjectSettings settings
        +moduleType() ModuleType
    }
    class ReportProjectSettings {
        <<ValueObject>>
        -number fiscalYearStartMonth
        -number rejectedRowsThresholdPercent
    }
    class InventoryProjectSettings {
        <<ValueObject>>
        -CountMode defaultMode
        -Tolerance defaultTolerance
    }
    class ModuleType {
        <<enumeration>>
        REPORTS
        INVENTORY
    }
    class ProjectMember {
        <<Entity>>
        -EntityId projectId
        -EntityId userId
        -EntityId[] roleIds
        -EntityId addedBy
        -Date joinedAt
        +assignRole(roleId EntityId) void
        +removeRole(roleId EntityId) Result~ProjectMember~
    }
    class Role {
        <<AggregateRoot>>
        -EntityId id
        -Nullable~EntityId~ projectId
        -string name
        -ModuleType module
        -Permission[] permissions
        -boolean system
        +grant(permission Permission) void
        +revoke(permission Permission) void
        +allows(action Action, subject Subject) boolean
    }
    class Permission {
        <<ValueObject>>
        -Action action
        -Subject subject
        -Nullable~PermissionCondition~ condition
        -FieldKey[] fields
    }
    class PermissionCondition {
        <<abstract>>
        +toCaslQuery()* ConditionQuery
    }
    class OwnedByPrincipalCondition
    class AssignedToPrincipalCondition
    class Action {
        <<enumeration>>
        MANAGE
        CREATE
        READ
        UPDATE
        DELETE
        SHARE
        EXPORT
        EXECUTE
        COUNT
        SUPERVISE
        APPROVE
    }
    class Subject {
        <<enumeration>>
        PROJECT
        MEMBER
        ROLE
        ORG_STRUCTURE
        DATA_SOURCE_PROFILE
        DATA_LOAD
        COLLECTION
        CLASSIFICATION
        CONSOLIDATION
        PIPELINE
        REPORT_TEMPLATE
        INVENTORY_COUNT
        COUNT_ROUND
        COUNT_ENTRY
        EVIDENCE
        CHAT_CHANNEL
    }
    class ResourceGrant {
        <<Entity>>
        -EntityId projectId
        -Subject subject
        -EntityId resourceId
        -EntityId userId
        -Action[] actions
        -Nullable~Date~ expiresAt
    }
    class ShareLink {
        <<AggregateRoot>>
        -EntityId projectId
        -TokenHash tokenHash
        -EntityId roleId
        -Nullable~Date~ expiresAt
        -Nullable~number~ maxUses
        -number uses
        -Nullable~Date~ revokedAt
        +redeem(userId EntityId, clock Clock) Result~ProjectMember~
        +revoke(clock Clock) void
        +isUsable(clock Clock) boolean
    }
    class Invitation {
        <<AggregateRoot>>
        -EntityId projectId
        -Email email
        -EntityId roleId
        -TokenHash tokenHash
        -InvitationStatus status
        -Date expiresAt
        +accept(userId EntityId, clock Clock) Result~ProjectMember~
        +decline() void
        +revoke() void
    }
    class InvitationStatus {
        <<enumeration>>
        PENDING
        ACCEPTED
        DECLINED
        EXPIRED
        REVOKED
    }
    class PolicyEvaluator {
        <<abstract>>
        +can(principal Principal, action Action, target PolicyTarget)* Promise~boolean~
        +packRules(principal Principal, projectId EntityId)* Promise~PackedRule[]~
    }
    class CaslPolicyEvaluator {
        -AbilityFactory factory
        -PermissionCache cache
    }
    class AbilityFactory {
        +createFor(member ProjectMember, roles Role[], grants ResourceGrant[]) AppAbility
    }

    Project <|-- ReportProject
    Project <|-- InventoryProject
    ReportProject *-- ReportProjectSettings
    InventoryProject *-- InventoryProjectSettings
    Project --> ModuleType
    Project "1" *-- "1..*" ProjectMember : miembros
    Project "1" o-- "0..*" Role : roles personalizados
    ProjectMember "0..*" --> "1..*" Role
    Role "1" *-- "1..*" Permission
    Permission --> Action
    Permission --> Subject
    Permission o-- PermissionCondition
    PermissionCondition <|-- OwnedByPrincipalCondition
    PermissionCondition <|-- AssignedToPrincipalCondition
    Project "1" *-- "0..*" ResourceGrant
    Project "1" *-- "0..*" ShareLink
    Project "1" *-- "0..*" Invitation
    ShareLink --> Role
    Invitation --> Role
    Invitation --> InvitationStatus
    PolicyEvaluator <|-- CaslPolicyEvaluator
    CaslPolicyEvaluator --> AbilityFactory
```

## 4. Chat (`chat`)

```mermaid
classDiagram
    class Conversation {
        <<abstract>>
        -EntityId id
        -Date createdAt
        -Nullable~Date~ lastMessageAt
        +type()* ConversationType
        +admits(principal ChatPrincipal)* boolean
        +touch(at Date) void
    }
    class GlobalConversation {
        +admits(principal ChatPrincipal) boolean
    }
    class DirectConversation {
        -EntityId firstUserId
        -EntityId secondUserId
        -string pairKey
        +between(a EntityId, b EntityId)$ DirectConversation
        +admits(principal ChatPrincipal) boolean
        +counterpartOf(userId EntityId) EntityId
    }
    class ProjectConversation {
        -EntityId projectId
        +admits(principal ChatPrincipal) boolean
    }
    class ConversationType {
        <<enumeration>>
        GLOBAL
        DIRECT
        PROJECT
    }
    class Message {
        <<AggregateRoot>>
        -EntityId id
        -EntityId conversationId
        -EntityId senderId
        -MessageBody body
        -FileReference[] attachments
        -Date sentAt
        -Nullable~Date~ editedAt
        -Nullable~Date~ deletedAt
        +post(conversation Conversation, sender ChatPrincipal, body MessageBody)$ Result~Message~
        +edit(editor EntityId, body MessageBody, clock Clock) Result~Message~
        +softDelete(clock Clock) void
    }
    class MessageBody {
        <<ValueObject>>
        -string text
        -EntityId[] mentions
        +create(raw string)$ Result~MessageBody~
    }
    class ReadMarker {
        <<Entity>>
        -EntityId conversationId
        -EntityId userId
        -EntityId lastReadMessageId
        -Date readAt
        +advanceTo(messageId EntityId, at Date) void
    }
    class ChatPrincipal {
        <<ValueObject>>
        -EntityId userId
        -EntityId[] projectIds
    }
    class PresenceTracker {
        <<abstract>>
        +markOnline(userId EntityId, socketId string)* Promise~void~
        +markOffline(userId EntityId, socketId string)* Promise~void~
        +onlineUsers(userIds EntityId[])* Promise~EntityId[]~
    }
    class RedisPresenceTracker
    class SendMessageUseCase {
        -ConversationRepository conversations
        -MessageRepository messages
        -RealtimeEventPublisher publisher
        +execute(command SendMessageCommand) Promise~Result~MessageDto~~
    }

    Conversation <|-- GlobalConversation
    Conversation <|-- DirectConversation
    Conversation <|-- ProjectConversation
    Conversation --> ConversationType
    Conversation "1" --> "0..*" Message
    Message *-- MessageBody
    Conversation "1" --> "0..*" ReadMarker
    Conversation ..> ChatPrincipal
    PresenceTracker <|-- RedisPresenceTracker
    SendMessageUseCase ..> Message
    SendMessageUseCase ..> Conversation
```

## 5. Estructura organizacional (`reports/org-structure`)

```mermaid
classDiagram
    class Organization {
        <<AggregateRoot>>
        -EntityId id
        -EntityId projectId
        -string code
        -string name
        -Country[] countries
        +addCountry(country Country) Result~Country~
        +removeCountry(countryId EntityId) Result~Organization~
        +findCountry(countryId EntityId) Optional~Country~
    }
    class Country {
        <<Entity>>
        -EntityId id
        -string isoCode
        -string name
        -CurrencyCode[] currencies
        +enableCurrency(code CurrencyCode) void
        +disableCurrency(code CurrencyCode) Result~Country~
        +supportsCurrency(code CurrencyCode) boolean
    }
    class Currency {
        <<ValueObject>>
        -CurrencyCode code
        -string name
        -string symbol
        -number minorUnits
    }
    class CurrencyCode {
        <<ValueObject>>
        -string value
        +create(iso4217 string)$ Result~CurrencyCode~
    }
    class Company {
        <<AggregateRoot>>
        -EntityId id
        -EntityId organizationId
        -EntityId countryId
        -string code
        -string name
        -Enterprise[] enterprises
        +addEnterprise(enterprise Enterprise) Result~Enterprise~
        +findEnterprise(id EntityId) Optional~Enterprise~
    }
    class Enterprise {
        <<Entity>>
        -EntityId id
        -string code
        -string name
        -Branch[] branches
        +addBranch(branch Branch) Result~Branch~
    }
    class Branch {
        <<Entity>>
        -EntityId id
        -string code
        -string name
    }
    class EntityScope {
        <<ValueObject>>
        -EntityId organizationId
        -EntityId countryId
        -CurrencyCode currency
        -EntityId companyId
        -Nullable~EntityId~ enterpriseId
        -Nullable~EntityId~ branchId
        +level() ScopeLevel
        +contains(other EntityScope) boolean
        +sameCurrencyAs(other EntityScope) boolean
    }
    class ScopeLevel {
        <<enumeration>>
        COMPANY
        ENTERPRISE
        BRANCH
    }
    class EntityScopeFactory {
        -OrganizationRepository organizations
        -CompanyRepository companies
        +create(input ScopeInput) Promise~Result~EntityScope~~
    }

    Organization "1" *-- "1..*" Country : tiene
    Country "1..*" o-- "1..*" Currency : maneja
    Country *-- CurrencyCode
    Organization "1" --> "1..*" Company
    Country "1" <-- "1..*" Company : opera en
    Company "1" *-- "0..*" Enterprise : tiene
    Enterprise "1" *-- "0..*" Branch : tiene
    EntityScope --> ScopeLevel
    EntityScopeFactory ..> EntityScope : valida jerarquía y moneda
```

> `EntityScopeFactory` garantiza que la moneda esté habilitada en el país, que la compañía
> pertenezca al país y que la empresa/sucursal pertenezcan a la compañía/empresa indicadas.

## 6. Ingestión de datos — configuración (`data-ingestion`)

Motor **compartido** por Reportes e Inventarios (`ProfileTarget`).

```mermaid
classDiagram
    class DataSourceProfile {
        <<abstract>>
        -EntityId id
        -EntityId projectId
        -string name
        -ProfileTarget target
        -ColumnDefinition[] columns
        -RowRule[] rowRules
        -number version
        +addColumn(column ColumnDefinition) Result~DataSourceProfile~
        +removeColumn(key FieldKey) void
        +identifierColumns() ColumnDefinition[]
        +activeColumns() ColumnDefinition[]
        +validateConfiguration() ValidationReport
        +sourceKind()* SourceKind
        #validateSpecifics(report ValidationReport)* void
    }
    class FileSourceProfile {
        <<abstract>>
        -FileExtension[] acceptedExtensions
        -TextEncoding encoding
    }
    class FixedWidthProfile {
        +sourceKind() SourceKind
        #validateSpecifics(report ValidationReport) void
    }
    class DelimitedProfile {
        -Delimiter delimiter
        -Nullable~string~ textQualifier
        -boolean hasHeaderRow
        #validateSpecifics(report ValidationReport) void
    }
    class SpreadsheetProfile {
        -SheetSelector sheet
        -number headerRow
        -number firstDataRow
        #validateSpecifics(report ValidationReport) void
    }
    class DatabaseProfile {
        -EntityId connectionId
        -SelectQuery query
        -QueryParameter[] parameters
        #validateSpecifics(report ValidationReport) void
    }
    class SheetSelector {
        <<abstract>>
        +resolve(sheetNames string[])* Result~string~
    }
    class FirstSheetSelector
    class NamedSheetSelector {
        -string sheetName
    }
    class Delimiter {
        <<ValueObject>>
        -string symbol
        +comma()$ Delimiter
        +semicolon()$ Delimiter
        +pipe()$ Delimiter
        +tab()$ Delimiter
        +custom(symbol string)$ Result~Delimiter~
    }
    class ColumnDefinition {
        <<ValueObject>>
        -FieldKey key
        -string label
        -ColumnLocator locator
        -DataType dataType
        -ColumnRole role
        -boolean required
        -boolean omitted
        -ParseOptions parseOptions
        +isIdentifier() boolean
    }
    class ColumnLocator {
        <<abstract>>
        +extract(raw RawRecord)* Nullable~string~
    }
    class FixedWidthLocator {
        -number start
        -number length
        +overlaps(other FixedWidthLocator) boolean
    }
    class IndexLocator {
        -number index
    }
    class HeaderLocator {
        -string headerName
    }
    class ParseOptions {
        <<ValueObject>>
        -string decimalSeparator
        -string thousandsSeparator
        -NegativeNumberFormat negativeFormat
        -string datePattern
        -boolean trim
    }
    class DataType {
        <<enumeration>>
        TEXT
        INTEGER
        DECIMAL
        DATE
        BOOLEAN
    }
    class ColumnRole {
        <<enumeration>>
        IDENTIFIER_CODE
        IDENTIFIER_NAME
        IDENTIFIER_ID
        MEASURE
        DEBIT
        CREDIT
        BALANCE
        OPENING_BALANCE
        ATTRIBUTE
        DATE
        LOCATION
        EXPECTED_QUANTITY
        UNIT_COST
    }
    class RowRule {
        <<abstract>>
        +shouldSkip(line RawLine)* boolean
        +describe()* string
    }
    class SkipBlankLinesRule
    class SkipPageBreaksRule
    class SkipLeadingLinesRule {
        -number count
    }
    class SkipMatchingTextRule {
        -TextOperator operator
        -string text
    }
    class DatabaseConnection {
        <<AggregateRoot>>
        -EntityId projectId
        -DatabaseEngine engine
        -string host
        -number port
        -string database
        -string username
        -EncryptedSecret secret
        -number timeoutMs
    }
    class DatabaseEngine {
        <<enumeration>>
        SQL_SERVER
        POSTGRESQL
        MYSQL
        MONGODB
        ORACLE
    }
    class ProfileTarget {
        <<enumeration>>
        REPORT_DATASET
        INVENTORY_ITEMS
    }

    DataSourceProfile <|-- FileSourceProfile
    DataSourceProfile <|-- DatabaseProfile
    FileSourceProfile <|-- FixedWidthProfile
    FileSourceProfile <|-- DelimitedProfile
    FileSourceProfile <|-- SpreadsheetProfile
    DataSourceProfile --> ProfileTarget
    DataSourceProfile "1" *-- "1..*" ColumnDefinition
    DataSourceProfile "1" *-- "0..*" RowRule
    ColumnDefinition *-- ColumnLocator
    ColumnDefinition *-- ParseOptions
    ColumnDefinition --> DataType
    ColumnDefinition --> ColumnRole
    ColumnLocator <|-- FixedWidthLocator
    ColumnLocator <|-- IndexLocator
    ColumnLocator <|-- HeaderLocator
    RowRule <|-- SkipBlankLinesRule
    RowRule <|-- SkipPageBreaksRule
    RowRule <|-- SkipLeadingLinesRule
    RowRule <|-- SkipMatchingTextRule
    SpreadsheetProfile *-- SheetSelector
    SheetSelector <|-- FirstSheetSelector
    SheetSelector <|-- NamedSheetSelector
    DelimitedProfile *-- Delimiter
    DatabaseProfile --> DatabaseConnection
    DatabaseConnection --> DatabaseEngine
```

## 7. Ingestión de datos — lectura y validación

```mermaid
classDiagram
    class ImportJob {
        <<AggregateRoot>>
        -EntityId id
        -EntityId profileId
        -number profileVersion
        -ImportJobStatus status
        -ImportStats stats
        -RowIssue[] issues
        -Nullable~Date~ finishedAt
        +start(clock Clock) void
        +reportProgress(stats ImportStats) void
        +addIssue(issue RowIssue) void
        +complete(clock Clock) void
        +fail(error DomainError, clock Clock) void
        +exceedsRejectionThreshold(percent number) boolean
    }
    class ImportJobStatus {
        <<enumeration>>
        QUEUED
        READING
        VALIDATING
        PERSISTING
        COMPLETED
        FAILED
        CANCELLED
    }
    class RowIssue {
        <<ValueObject>>
        -number lineNumber
        -Nullable~FieldKey~ column
        -IssueCode code
        -string message
        -string rawSnippet
    }
    class RecordReader {
        <<abstract>>
        +read(source ReadableSource, profile DataSourceProfile) AsyncIterable~RawRecord~
        #openRecords(source ReadableSource)* AsyncIterable~RawLine~
        #split(line RawLine)* RawRecord
    }
    class FixedWidthRecordReader
    class DelimitedRecordReader
    class SpreadsheetRecordReader
    class DatabaseRecordReader {
        -DatabaseConnector connector
    }
    class RecordReaderFactory {
        +create(profile DataSourceProfile) RecordReader
    }
    class DatabaseConnector {
        <<abstract>>
        +test(connection DatabaseConnection)* Promise~ConnectionTestResult~
        +stream(connection DatabaseConnection, query SelectQuery)* AsyncIterable~RawRecord~
    }
    class SqlServerConnector
    class PostgresConnector
    class MySqlConnector
    class MongoConnector
    class RecordMapper {
        -ValueParserRegistry parsers
        +map(raw RawRecord, profile DataSourceProfile) MappingResult
    }
    class MappingResult {
        <<abstract>>
    }
    class MappedRecord {
        -FieldValueMap values
    }
    class RejectedRecord {
        -RowIssue[] issues
    }
    class ValueParser {
        <<abstract>>
        +dataType()* DataType
        +parse(raw string, options ParseOptions)* Result~FieldValue~
    }
    class TextParser
    class IntegerParser
    class DecimalParser
    class DateParser
    class BooleanParser
    class FieldValue {
        <<abstract>>
        +dataType()* DataType
        +isEmpty()* boolean
        +accept(visitor FieldValueVisitor~R~)* R
    }
    class TextValue {
        -string value
    }
    class DecimalValue {
        -Decimal value
    }
    class DateValue {
        -Date value
    }
    class BooleanValue {
        -boolean value
    }
    class EmptyValue {
        +instance()$ EmptyValue
    }
    class ImportPipeline {
        -RecordReaderFactory readers
        -RecordMapper mapper
        -RecordSink sink
        +run(job ImportJob, source ReadableSource) Promise~ImportJob~
    }
    class RecordSink {
        <<abstract>>
        +write(batch MappedRecord[])* Promise~void~
        +commit()* Promise~void~
    }
    class ReportDatasetSink
    class InventoryItemsSink

    ImportJob --> ImportJobStatus
    ImportJob "1" *-- "0..*" RowIssue
    RecordReader <|-- FixedWidthRecordReader
    RecordReader <|-- DelimitedRecordReader
    RecordReader <|-- SpreadsheetRecordReader
    RecordReader <|-- DatabaseRecordReader
    RecordReaderFactory ..> RecordReader : crea
    DatabaseRecordReader --> DatabaseConnector
    DatabaseConnector <|-- SqlServerConnector
    DatabaseConnector <|-- PostgresConnector
    DatabaseConnector <|-- MySqlConnector
    DatabaseConnector <|-- MongoConnector
    RecordMapper --> ValueParser
    RecordMapper ..> MappingResult
    MappingResult <|-- MappedRecord
    MappingResult <|-- RejectedRecord
    ValueParser <|-- TextParser
    ValueParser <|-- IntegerParser
    ValueParser <|-- DecimalParser
    ValueParser <|-- DateParser
    ValueParser <|-- BooleanParser
    ValueParser ..> FieldValue
    FieldValue <|-- TextValue
    FieldValue <|-- DecimalValue
    FieldValue <|-- DateValue
    FieldValue <|-- BooleanValue
    FieldValue <|-- EmptyValue
    ImportPipeline --> RecordReaderFactory
    ImportPipeline --> RecordMapper
    ImportPipeline --> RecordSink
    RecordSink <|-- ReportDatasetSink
    RecordSink <|-- InventoryItemsSink
```

> Patrones: **Template Method** (`RecordReader.read` fija el algoritmo: abrir → aplicar
> `RowRule` → dividir), **Strategy** (lectores, conectores, *parsers*), **Factory**
> (`RecordReaderFactory`), **Null Object** (`EmptyValue` evita `null`/`undefined` en celdas).

## 8. Datasets, colecciones y clasificaciones

```mermaid
classDiagram
    class Dataset {
        <<abstract>>
        -EntityId id
        -EntityId projectId
        -Period period
        -DatasetStatus status
        -number dataVersion
        -number recordCount
        +stage()* DataStage
        +publish(clock Clock) void
    }
    class DataLoad {
        -EntityId profileId
        -EntityScope scope
        -number version
        -EntityId importJobId
        -Nullable~EntityId~ supersededBy
        +supersede(next DataLoad) void
        +stage() DataStage
    }
    class ConsolidatedDataset {
        -EntityId definitionId
        -EntityId[] sourceDatasetIds
        +stage() DataStage
    }
    class TransformedDataset {
        -EntityId pipelineId
        -number pipelineVersion
        -EntityId sourceDatasetId
        +stage() DataStage
    }
    class DataStage {
        <<enumeration>>
        RAW
        CONSOLIDATED
        TRANSFORMED
    }
    class DatasetStatus {
        <<enumeration>>
        STAGED
        PUBLISHED
        SUPERSEDED
        FAILED
    }
    class DataRecord {
        <<Entity>>
        -EntityId datasetId
        -DataStage stage
        -Period period
        -EntityScope scope
        -RecordIdentifiers identifiers
        -MeasureSet measures
        -AttributeSet attributes
        -ClassificationMembership[] memberships
        +measure(key FieldKey) Decimal
        +withMeasure(key FieldKey, value Decimal) DataRecord
    }
    class RecordIdentifiers {
        <<ValueObject>>
        -Nullable~string~ code
        -Nullable~string~ name
        -Nullable~string~ externalId
        +valueOf(field IdentifierField) Nullable~string~
    }
    class MeasureSet {
        <<ValueObject>>
        -Map~FieldKey,Decimal~ values
        +get(key FieldKey) Decimal
        +with(key FieldKey, value Decimal) MeasureSet
    }
    class SupplementaryCollection {
        <<AggregateRoot>>
        -EntityId id
        -EntityId projectId
        -string name
        -CollectionField[] fields
        -CollectionPeriodicity periodicity
        +addField(field CollectionField) Result~SupplementaryCollection~
        +createEntry(values FieldValueMap, period Nullable~Period~) Result~CollectionEntry~
        +keyFields() CollectionField[]
    }
    class CollectionField {
        <<ValueObject>>
        -FieldKey key
        -string label
        -DataType dataType
        -boolean isKey
        -boolean required
    }
    class CollectionEntry {
        <<Entity>>
        -EntityId collectionId
        -Nullable~Period~ period
        -FieldValueMap values
    }
    class CollectionPeriodicity {
        <<enumeration>>
        NONE
        MONTHLY
        DAILY
    }
    class Classification {
        <<AggregateRoot>>
        -EntityId id
        -EntityId projectId
        -string name
        -IdentifierField targetField
        -ClassificationNode[] roots
        -UnmatchedPolicy unmatchedPolicy
        +addNode(parentId Nullable~EntityId~, node ClassificationNode) Result~Classification~
        +moveNode(nodeId EntityId, newParentId Nullable~EntityId~) Result~Classification~
        +classify(identifiers RecordIdentifiers) Optional~ClassificationMembership~
        +coverage(identifiers RecordIdentifiers[]) CoverageReport
    }
    class ClassificationNode {
        <<Entity>>
        -EntityId id
        -string code
        -string name
        -number order
        -PresentationSign sign
        -MatchRule rule
        -ClassificationNode[] children
        +isLeaf() boolean
        +matches(value string) boolean
    }
    class MatchRule {
        <<abstract>>
        +isSatisfiedBy(value string)* boolean
        +and(other MatchRule) MatchRule
        +or(other MatchRule) MatchRule
        +not() MatchRule
    }
    class EqualsRule {
        -string[] values
    }
    class StartsWithRule {
        -string prefix
    }
    class ContainsRule {
        -string fragment
    }
    class EndsWithRule {
        -string suffix
    }
    class RangeRule {
        -string from
        -string to
    }
    class AndRule
    class OrRule
    class NotRule
    class NeverMatchRule
    class ClassificationMembership {
        <<ValueObject>>
        -EntityId classificationId
        -EntityId nodeId
        -EntityId[] ancestorIds
    }
    class CoverageReport {
        <<ValueObject>>
        -number matched
        -string[] unmatched
        -string[] ambiguous
    }

    Dataset <|-- DataLoad
    Dataset <|-- ConsolidatedDataset
    Dataset <|-- TransformedDataset
    Dataset --> DataStage
    Dataset --> DatasetStatus
    Dataset "1" *-- "0..*" DataRecord
    DataRecord *-- RecordIdentifiers
    DataRecord *-- MeasureSet
    DataRecord "1" *-- "0..*" ClassificationMembership
    SupplementaryCollection "1" *-- "1..*" CollectionField
    SupplementaryCollection "1" --> "0..*" CollectionEntry
    SupplementaryCollection --> CollectionPeriodicity
    Classification "1" *-- "1..*" ClassificationNode
    ClassificationNode "1" *-- "0..*" ClassificationNode : hijos
    ClassificationNode *-- MatchRule
    MatchRule <|-- EqualsRule
    MatchRule <|-- StartsWithRule
    MatchRule <|-- ContainsRule
    MatchRule <|-- EndsWithRule
    MatchRule <|-- RangeRule
    MatchRule <|-- AndRule
    MatchRule <|-- OrRule
    MatchRule <|-- NotRule
    MatchRule <|-- NeverMatchRule
    Classification ..> ClassificationMembership : produce
    Classification ..> CoverageReport
```

> Patrones: **Composite** (árbol de `ClassificationNode`), **Specification** (`MatchRule` con
> combinadores `and/or/not`), **Null Object** (`NeverMatchRule` para nodos agrupadores sin regla).

## 9. Consolidación y operaciones (`consolidation`, `transformations`)

```mermaid
classDiagram
    class ConsolidationDefinition {
        <<AggregateRoot>>
        -EntityId id
        -EntityId projectId
        -string name
        -CurrencyCode currency
        -ScopeLevel level
        -EntityScope[] members
        -IdentifierField groupBy
        -FieldKey[] measures
        +addMember(scope EntityScope) Result~ConsolidationDefinition~
        +plan(period Period, available DataLoad[]) Result~ConsolidationPlan~
    }
    class ConsolidationPlan {
        <<ValueObject>>
        -Period period
        -DataLoad[] inputs
        -EntityScope[] missing
        +isComplete() boolean
    }
    class ConsolidationEngine {
        <<abstract>>
        +run(definition ConsolidationDefinition, plan ConsolidationPlan)* Promise~ConsolidatedDataset~
    }
    class MongoAggregationConsolidationEngine
    class TransformationPipeline {
        <<AggregateRoot>>
        -EntityId id
        -EntityId projectId
        -string name
        -DatasetSelector source
        -TransformationStep[] steps
        -number version
        +addStep(step TransformationStep) void
        +moveStep(stepId EntityId, index number) Result~TransformationPipeline~
        +removeStep(stepId EntityId) void
    }
    class PipelineRunner {
        +run(pipeline TransformationPipeline, context PipelineContext) Promise~PipelineRunReport~
    }
    class PipelineContext {
        -Period period
        -CollectionLookup collections
        -PriorPeriodReader history
        -FormulaEvaluator formulas
        -IssueCollector issues
    }
    class TransformationStep {
        <<abstract>>
        -EntityId id
        -string label
        +apply(records RecordStream, context PipelineContext)* RecordStream
        +describe()* string
    }
    class FilterStep {
        -RecordSpecification specification
        -FilterMode mode
    }
    class ConditionalAssignmentStep {
        -RecordSpecification when
        -FieldKey target
        -Expression thenValue
        -Expression otherwiseValue
    }
    class ComputedFieldStep {
        -FieldKey target
        -Expression expression
    }
    class AccumulationStep {
        -AccumulationMode mode
        -FieldKey debit
        -FieldKey credit
        -FieldKey balance
        -FieldKey target
    }
    class CurrencyConversionStep {
        -EntityId rateCollectionId
        -CurrencyCode targetCurrency
        -FieldKey[] measures
        -ConversionMethod method
    }
    class SyntheticRecordStep {
        -RecordIdentifiers identifiers
        -Expression amount
        -FieldKey target
    }
    class BalanceCheckStep {
        -FieldKey debit
        -FieldKey credit
        -Decimal tolerance
        -IssueSeverity severity
    }
    class AccumulationMode {
        <<enumeration>>
        ROLL_FORWARD_BALANCE
        YEAR_TO_DATE_MOVEMENTS
        YEAR_TO_DATE_NET
    }
    class RecordSpecification {
        <<abstract>>
        +isSatisfiedBy(record DataRecord)* boolean
    }
    class TextFieldSpecification {
        -IdentifierField field
        -TextOperator operator
        -string value
    }
    class ClassificationSpecification {
        -EntityId classificationId
        -EntityId nodeId
    }
    class TextOperator {
        <<enumeration>>
        EQUALS
        CONTAINS
        STARTS_WITH
        ENDS_WITH
    }

    ConsolidationDefinition ..> ConsolidationPlan : crea
    ConsolidationEngine <|-- MongoAggregationConsolidationEngine
    ConsolidationEngine ..> ConsolidationPlan
    TransformationPipeline "1" *-- "1..*" TransformationStep
    PipelineRunner ..> TransformationPipeline
    PipelineRunner ..> PipelineContext
    TransformationStep <|-- FilterStep
    TransformationStep <|-- ConditionalAssignmentStep
    TransformationStep <|-- ComputedFieldStep
    TransformationStep <|-- AccumulationStep
    TransformationStep <|-- CurrencyConversionStep
    TransformationStep <|-- SyntheticRecordStep
    TransformationStep <|-- BalanceCheckStep
    AccumulationStep --> AccumulationMode
    FilterStep --> RecordSpecification
    ConditionalAssignmentStep --> RecordSpecification
    RecordSpecification <|-- TextFieldSpecification
    RecordSpecification <|-- ClassificationSpecification
    TextFieldSpecification --> TextOperator
```

Semántica de `AccumulationStep` (RF-REP-10):

| Modo | Cálculo para el período *p* |
|---|---|
| `ROLL_FORWARD_BALANCE` | `saldo(p) = saldo(p−1) + debe(p) − haber(p)` |
| `YEAR_TO_DATE_MOVEMENTS` | `debeAcum(p) = Σ debe(inicioAño..p)`; `haberAcum(p) = Σ haber(inicioAño..p)` |
| `YEAR_TO_DATE_NET` | `netoAcum(p) = Σ (debe − haber)(inicioAño..p)` |

> Patrones: **Pipeline / Chain of Responsibility** (`TransformationStep`), **Strategy**
> (`ConsolidationEngine`), **Specification** (`RecordSpecification`).

## 10. Motor de fórmulas (`libs/shared/formula-engine`)

```mermaid
classDiagram
    class FormulaCompiler {
        -Lexer lexer
        -Parser parser
        +compile(source string) Result~CompiledFormula~
    }
    class Lexer {
        +tokenize(source string) Result~Token[]~
    }
    class Token {
        <<ValueObject>>
        -TokenType type
        -string lexeme
        -number position
    }
    class Parser {
        -Token[] tokens
        -number cursor
        +parse(tokens Token[]) Result~Expression~
        -parseExpression(precedence number) Expression
    }
    class CompiledFormula {
        -string source
        -Expression root
        -CellAddress[] dependencies
    }
    class Expression {
        <<abstract>>
        +accept(visitor ExpressionVisitor~R~)* R
    }
    class NumberLiteral {
        -Decimal value
    }
    class TextLiteral {
        -string value
    }
    class CellReference {
        -Nullable~string~ page
        -Nullable~string~ element
        -number row
        -number column
    }
    class RangeReference {
        -CellReference start
        -CellReference end
    }
    class UnaryExpression {
        -UnaryOperator operator
        -Expression operand
    }
    class BinaryExpression {
        -BinaryOperator operator
        -Expression left
        -Expression right
    }
    class FunctionCall {
        -string name
        -Expression[] args
    }
    class ExpressionVisitor~R~ {
        <<interface>>
        +visitNumber(node NumberLiteral) R
        +visitText(node TextLiteral) R
        +visitCell(node CellReference) R
        +visitRange(node RangeReference) R
        +visitUnary(node UnaryExpression) R
        +visitBinary(node BinaryExpression) R
        +visitCall(node FunctionCall) R
    }
    class Evaluator {
        -EvaluationContext context
        -FunctionRegistry functions
    }
    class DependencyCollector
    class DependencyGraph {
        +add(cell CellAddress, dependencies CellAddress[]) void
        +evaluationOrder() Result~CellAddress[]~
    }
    class FormulaFunction {
        <<abstract>>
        +name()* string
        +arity()* Arity
        +invoke(args FormulaValue[], context EvaluationContext)* FormulaValue
    }
    class SumFunction
    class IfFunction
    class SafeDivideFunction
    class ClassificationFunction
    class CollectionFunction
    class PeriodFunction
    class FunctionRegistry {
        +register(fn FormulaFunction) void
        +resolve(name string) Optional~FormulaFunction~
    }
    class FormulaValue {
        <<abstract>>
    }
    class NumberValue {
        -Decimal value
    }
    class TextFormulaValue
    class BooleanFormulaValue
    class ErrorValue {
        -FormulaErrorCode code
    }

    FormulaCompiler --> Lexer
    FormulaCompiler --> Parser
    Lexer ..> Token
    Parser ..> Expression
    FormulaCompiler ..> CompiledFormula
    CompiledFormula *-- Expression
    Expression <|-- NumberLiteral
    Expression <|-- TextLiteral
    Expression <|-- CellReference
    Expression <|-- RangeReference
    Expression <|-- UnaryExpression
    Expression <|-- BinaryExpression
    Expression <|-- FunctionCall
    ExpressionVisitor~R~ <|.. Evaluator
    ExpressionVisitor~R~ <|.. DependencyCollector
    Evaluator --> FunctionRegistry
    FunctionRegistry o-- FormulaFunction
    FormulaFunction <|-- SumFunction
    FormulaFunction <|-- IfFunction
    FormulaFunction <|-- SafeDivideFunction
    FormulaFunction <|-- ClassificationFunction
    FormulaFunction <|-- CollectionFunction
    FormulaFunction <|-- PeriodFunction
    Evaluator ..> FormulaValue
    FormulaValue <|-- NumberValue
    FormulaValue <|-- TextFormulaValue
    FormulaValue <|-- BooleanFormulaValue
    FormulaValue <|-- ErrorValue
    DependencyCollector ..> DependencyGraph
```

Ejemplos de fórmulas soportadas:

```text
=F3 - F5                                   ' fila 3 menos fila 5 de la misma tabla
=SUMA(F1:F4)                               ' total de un rango
=Resultados!C12 / Balance!C30              ' referencia a otras tablas del informe
=Pagina2.EBITDA!C4                         ' referencia a otra página
=DIVIDIR(F10; F2; 0)                       ' división segura con valor por defecto
=CLASIF("Ingresos") - CLASIF("Costos")     ' saldo de nodos de clasificación
=F8 / COLECCION("TipoCambio"; "USD"; PERIODO())
=SI(F4 < 0; 0; F4)
```

> Patrones: **Interpreter + Composite** (AST), **Visitor** (evaluar, recolectar dependencias,
> formatear), **Registry** (funciones extensibles). Sin `eval` ni `Function`.

## 11. Plantillas de informe (`templates`, `rendering`)

```mermaid
classDiagram
    class ReportTemplate {
        <<AggregateRoot>>
        -EntityId id
        -EntityId projectId
        -string name
        -number version
        -TemplateStatus status
        -ReportParameter[] parameters
        -ReportPage[] pages
        -ReportTheme theme
        +addPage(format PageFormat, orientation Orientation) ReportPage
        +movePage(pageId EntityId, index number) Result~ReportTemplate~
        +removePage(pageId EntityId) Result~ReportTemplate~
        +findElement(ref ElementRef) Optional~ReportElement~
        +publish() Result~ReportTemplate~
    }
    class ReportPage {
        <<Entity>>
        -EntityId id
        -string name
        -PageFormat format
        -Orientation orientation
        -Margins margins
        -Nullable~PageBand~ header
        -Nullable~PageBand~ footer
        -ReportElement[] elements
        +addElement(element ReportElement) Result~ReportPage~
        +removeElement(elementId EntityId) void
        +printableArea() LayoutBox
    }
    class PageFormat {
        <<ValueObject>>
        -PageFormatName name
        -Millimeters width
        -Millimeters height
        +letter()$ PageFormat
        +legal()$ PageFormat
        +oficio()$ PageFormat
        +a4()$ PageFormat
        +custom(width Millimeters, height Millimeters)$ Result~PageFormat~
    }
    class PageBand {
        <<ValueObject>>
        -Millimeters height
        -ReportElement[] elements
    }
    class ReportParameter {
        <<ValueObject>>
        -ParameterKind kind
        -string name
        -ParameterDefault defaultValue
    }
    class ReportElement {
        <<abstract>>
        -EntityId id
        -string name
        -LayoutBox box
        -ElementStyle style
        +moveTo(x Millimeters, y Millimeters) void
        +resize(width Millimeters, height Millimeters) void
        +accept(visitor ReportElementVisitor~R~)* R
    }
    class TextElement {
        -RichText content
    }
    class ImageElement {
        -EntityId fileId
        -ImageFit fit
    }
    class ShapeElement {
        -ShapeKind kind
    }
    class MatrixTableElement {
        -DataBinding binding
        -AxisMember[] rows
        -AxisMember[] columns
        -CellOverride[] overrides
        -NumberFormat numberFormat
        -ConditionalFormatRule[] conditionalFormats
    }
    class PivotTableElement {
        -DataBinding binding
        -Dimension[] rowDimensions
        -Dimension[] columnDimensions
        -Aggregation aggregation
        -boolean showSubtotals
    }
    class ChartElement {
        -ChartType type
        -ChartSeries[] series
        -ChartOptions options
    }
    class KpiElement {
        -CompiledFormula formula
        -NumberFormat numberFormat
    }
    class DataBinding {
        <<ValueObject>>
        -DataStage stage
        -FieldKey measure
        -Aggregation aggregation
        -DimensionFilter[] baseFilters
    }
    class AxisMember {
        <<abstract>>
        -EntityId id
        -string label
        -AxisStyle style
        +resolve(context AxisContext)* AxisResolution
    }
    class FilterAxisMember {
        -DimensionFilter[] filters
    }
    class FormulaAxisMember {
        -CompiledFormula formula
    }
    class TotalAxisMember {
        -AxisRange range
        -Aggregation aggregation
    }
    class LabelAxisMember
    class DimensionFilter {
        <<ValueObject>>
        -Dimension dimension
        -FilterOperator operator
        -FilterValue[] values
    }
    class Dimension {
        <<enumeration>>
        CLASSIFICATION
        ORGANIZATION
        COUNTRY
        CURRENCY
        COMPANY
        ENTERPRISE
        BRANCH
        YEAR
        MONTH
        MEASURE
    }
    class FilterValue {
        <<abstract>>
    }
    class FixedFilterValue {
        -string value
    }
    class RelativePeriodValue {
        -RelativePeriod relation
    }
    class ConditionalFormatRule {
        <<ValueObject>>
        -FormatCondition condition
        -CellStyle style
    }
    class NumberFormat {
        <<ValueObject>>
        -number decimals
        -boolean thousandsSeparator
        -NegativeStyle negativeStyle
        -NumberScale scale
        -string prefix
        -string suffix
    }
    class ReportElementVisitor~R~ {
        <<interface>>
        +visitText(element TextElement) R
        +visitImage(element ImageElement) R
        +visitShape(element ShapeElement) R
        +visitMatrix(element MatrixTableElement) R
        +visitPivot(element PivotTableElement) R
        +visitChart(element ChartElement) R
        +visitKpi(element KpiElement) R
    }
    class ReportComputationService {
        -ReportQueryEngine queries
        -FormulaCompiler formulas
        +compute(template ReportTemplate, parameters ReportParameterValues) Promise~ComputedReport~
    }
    class ElementComputationVisitor
    class ReportQueryEngine {
        <<abstract>>
        +evaluateCells(requests CellQuery[])* Promise~CellResult[]~
        +evaluatePivot(element PivotTableElement, context RenderContext)* Promise~PivotResult~
    }
    class MongoReportQueryEngine
    class ComputedReport {
        -ComputedPage[] pages
        -Date computedAt
        -number dataVersion
    }

    ReportTemplate "1" *-- "1..*" ReportPage
    ReportTemplate "1" *-- "0..*" ReportParameter
    ReportPage *-- PageFormat
    ReportPage "1" *-- "0..2" PageBand
    ReportPage "1" *-- "0..*" ReportElement
    PageBand o-- ReportElement
    ReportElement <|-- TextElement
    ReportElement <|-- ImageElement
    ReportElement <|-- ShapeElement
    ReportElement <|-- MatrixTableElement
    ReportElement <|-- PivotTableElement
    ReportElement <|-- ChartElement
    ReportElement <|-- KpiElement
    MatrixTableElement *-- DataBinding
    PivotTableElement *-- DataBinding
    MatrixTableElement "1" *-- "1..*" AxisMember : filas y columnas
    MatrixTableElement *-- NumberFormat
    MatrixTableElement "1" *-- "0..*" ConditionalFormatRule
    AxisMember <|-- FilterAxisMember
    AxisMember <|-- FormulaAxisMember
    AxisMember <|-- TotalAxisMember
    AxisMember <|-- LabelAxisMember
    FilterAxisMember "1" *-- "1..*" DimensionFilter
    DataBinding "1" *-- "0..*" DimensionFilter
    DimensionFilter --> Dimension
    DimensionFilter "1" *-- "1..*" FilterValue
    FilterValue <|-- FixedFilterValue
    FilterValue <|-- RelativePeriodValue
    ReportElementVisitor~R~ <|.. ElementComputationVisitor
    ReportComputationService --> ReportQueryEngine
    ReportComputationService ..> ElementComputationVisitor
    ReportComputationService ..> ComputedReport
    ReportQueryEngine <|-- MongoReportQueryEngine
```

**Resolución de una celda** de `MatrixTableElement`:

```text
celda(f, c) = agregación( medida,
                 filtros(binding.baseFilters)
               ∩ filtros(fila f)
               ∩ filtros(columna c)
               ∩ parámetros del informe (período, alcance) )
```

Las filas/columnas de tipo fórmula o total se evalúan después, en el orden topológico calculado
por `DependencyGraph`. Todas las celdas de filtro de una tabla se resuelven en **una sola**
agregación de MongoDB (`$match` común + `$group` por clave de fila × columna).

> Patrones: **Composite** (plantilla → páginas → elementos), **Visitor** (cálculo, renderizado,
> exportación), **Factory Method** (`PageFormat.letter()`…), **Strategy** (`ReportQueryEngine`).

## 12. Inventarios — toma y rondas (`inventory`)

```mermaid
classDiagram
    class InventoryCount {
        <<AggregateRoot>>
        -EntityId id
        -EntityId projectId
        -string name
        -string warehouse
        -Date scheduledAt
        -CountMode mode
        -Tolerance tolerance
        -number maxRounds
        -InventoryCountStatus status
        -EntityId sourceProfileId
        -FieldVisibilityPolicy visibility
        -CountParticipant[] participants
        -CountRound[] rounds
        +addParticipant(participant CountParticipant) Result~InventoryCount~
        +configureVisibility(policy FieldVisibilityPolicy) void
        +markReady() Result~InventoryCount~
        +startFirstRound(plan AssignmentPlan, clock Clock) Result~CountRound~
        +closeCurrentRound(clock Clock) Result~RoundSummary~
        +openRecount(itemIds EntityId[], plan AssignmentPlan, clock Clock) Result~CountRound~
        +close(clock Clock) Result~CountResult~
        +currentRound() Optional~CountRound~
    }
    class InventoryCountStatus {
        <<enumeration>>
        DRAFT
        READY
        IN_PROGRESS
        PAUSED
        IN_REVIEW
        CLOSED
        CANCELLED
    }
    class CountMode {
        <<enumeration>>
        BLIND
        WITH_EXPECTED_STOCK
    }
    class Tolerance {
        <<ValueObject>>
        -ToleranceKind kind
        -Decimal value
        +isExceededBy(expected Decimal, counted Decimal) boolean
    }
    class CountParticipant {
        <<ValueObject>>
        -EntityId userId
        -ParticipantRole role
    }
    class ParticipantRole {
        <<enumeration>>
        COUNTER
        SUPERVISOR
    }
    class FieldVisibilityPolicy {
        <<ValueObject>>
        -Map~ParticipantRole,FieldKey[]~ byRole
        -Map~EntityId,FieldKey[]~ byUser
        +visibleFieldsFor(participant CountParticipant) FieldKey[]
    }
    class InventoryItem {
        <<Entity>>
        -EntityId id
        -EntityId countId
        -string sku
        -string description
        -string unit
        -Decimal expectedQuantity
        -Decimal unitCost
        -StorageLocation location
        -AttributeSet attributes
        +project(fields FieldKey[]) ItemView
    }
    class StorageLocation {
        <<ValueObject>>
        -string[] segments
        -Nullable~Coordinates~ coordinates
        +compareTo(other StorageLocation) number
        +zoneKey(depth number) string
    }
    class CountRound {
        <<Entity>>
        -EntityId id
        -number number
        -RoundScope scope
        -RoundStatus status
        -CounterAssignment[] assignments
        -Date openedAt
        -Nullable~Date~ closedAt
        +nextItemFor(userId EntityId) Optional~EntityId~
        +record(entry CountEntry) Result~CountRound~
        +reassign(from EntityId, to EntityId, itemIds EntityId[]) Result~CountRound~
        +progress() RoundProgress
    }
    class RoundScope {
        <<enumeration>>
        ALL_ITEMS
        DISCREPANCIES_OF_PREVIOUS
    }
    class RoundStatus {
        <<enumeration>>
        OPEN
        CLOSED
    }
    class CounterAssignment {
        <<Entity>>
        -EntityId userId
        -EntityId[] route
        -number cursor
        -AssignmentOrigin origin
        +next() Optional~EntityId~
        +releaseTail(count number) EntityId[]
        +append(itemIds EntityId[]) void
        +remaining() number
    }
    class CountEntry {
        <<Entity>>
        -EntityId id
        -EntityId roundId
        -EntityId itemId
        -EntityId counterId
        -Decimal countedQuantity
        -CountOutcome outcome
        -Nullable~string~ comment
        -EntityId[] evidenceIds
        -Date countedAt
        -number revision
        +correct(quantity Decimal, by EntityId, clock Clock) CountEntry
    }
    class CountOutcome {
        <<enumeration>>
        COUNTED
        NOT_FOUND
        DAMAGED
        OTHER
    }
    class Evidence {
        <<Entity>>
        -EntityId id
        -EntityId entryId
        -EntityId fileId
        -EvidenceKind kind
        -EntityId uploadedBy
        -Date capturedAt
    }
    class VarianceCalculator {
        +calculate(item InventoryItem, entry CountEntry, tolerance Tolerance) Variance
    }
    class Variance {
        <<ValueObject>>
        -Decimal expected
        -Decimal counted
        -Decimal difference
        -Decimal valuedDifference
        -boolean withinTolerance
    }

    InventoryCount --> InventoryCountStatus
    InventoryCount --> CountMode
    InventoryCount *-- Tolerance
    InventoryCount *-- FieldVisibilityPolicy
    InventoryCount "1" *-- "1..*" CountParticipant
    CountParticipant --> ParticipantRole
    InventoryCount "1" --> "1..*" InventoryItem : productos
    InventoryItem *-- StorageLocation
    InventoryCount "1" *-- "1..*" CountRound : rondas
    CountRound --> RoundScope
    CountRound --> RoundStatus
    CountRound "1" *-- "1..*" CounterAssignment
    CountRound "1" --> "0..*" CountEntry
    CountEntry --> CountOutcome
    CountEntry "1" --> "0..*" Evidence
    VarianceCalculator ..> Variance
    VarianceCalculator ..> Tolerance
```

## 13. Inventarios — estrategias de asignación

```mermaid
classDiagram
    class AssignmentStrategy {
        <<abstract>>
        +plan(items InventoryItem[], counters CountParticipant[])* Result~AssignmentPlan~
        +name()* string
    }
    class ManualRangeStrategy {
        -LocationRange[] ranges
        +plan(items InventoryItem[], counters CountParticipant[]) Result~AssignmentPlan~
    }
    class ContiguousZoneStrategy {
        -RouteOrdering ordering
        -number aisleDepth
        -WorkloadEstimator workload
        +plan(items InventoryItem[], counters CountParticipant[]) Result~AssignmentPlan~
        -partition(ordered InventoryItem[], parts number) InventoryItem[][]
    }
    class SpatialClusterStrategy {
        -number maxIterations
        -WorkloadEstimator workload
        +plan(items InventoryItem[], counters CountParticipant[]) Result~AssignmentPlan~
    }
    class RouteOrdering {
        <<abstract>>
        +order(items InventoryItem[])* InventoryItem[]
    }
    class SerpentineRouteOrdering
    class NearestNeighborRouteOrdering
    class WorkloadEstimator {
        <<abstract>>
        +weightOf(item InventoryItem)* Decimal
    }
    class UniformWorkload
    class QuantityBasedWorkload
    class LocationRange {
        <<ValueObject>>
        -EntityId userId
        -StorageLocation from
        -StorageLocation to
        +contains(location StorageLocation) boolean
    }
    class AssignmentPlan {
        <<ValueObject>>
        -Map~EntityId,EntityId[]~ routes
        -EntityId[] unassigned
        +routeFor(userId EntityId) EntityId[]
    }
    class AssignmentStrategyFactory {
        +create(config AssignmentConfig) AssignmentStrategy
    }
    class WorkRebalancer {
        +rebalance(round CountRound, idleCounterId EntityId) Optional~Reassignment~
    }
    class ItemLockService {
        <<abstract>>
        +acquire(roundId EntityId, itemId EntityId, userId EntityId)* Promise~boolean~
        +renew(roundId EntityId, itemId EntityId, userId EntityId)* Promise~boolean~
        +release(roundId EntityId, itemId EntityId)* Promise~void~
    }
    class RedisItemLockService

    AssignmentStrategy <|-- ManualRangeStrategy
    AssignmentStrategy <|-- ContiguousZoneStrategy
    AssignmentStrategy <|-- SpatialClusterStrategy
    ManualRangeStrategy "1" *-- "1..*" LocationRange
    ContiguousZoneStrategy --> RouteOrdering
    SpatialClusterStrategy --> RouteOrdering
    ContiguousZoneStrategy --> WorkloadEstimator
    SpatialClusterStrategy --> WorkloadEstimator
    RouteOrdering <|-- SerpentineRouteOrdering
    RouteOrdering <|-- NearestNeighborRouteOrdering
    WorkloadEstimator <|-- UniformWorkload
    WorkloadEstimator <|-- QuantityBasedWorkload
    AssignmentStrategy ..> AssignmentPlan : produce
    AssignmentStrategyFactory ..> AssignmentStrategy : crea
    ItemLockService <|-- RedisItemLockService
```

**Algoritmo `ContiguousZoneStrategy`** (cumple "cerca entre sí, lejos entre usuarios"):

1. Ordenar los productos con `SerpentineRouteOrdering`: orden natural por segmentos de ubicación
   (bodega → pasillo → estante → nivel → posición), invirtiendo el sentido en pasillos alternos.
2. Calcular el peso de cada producto (`WorkloadEstimator`).
3. Partir la secuencia en *K* bloques **contiguos** de peso balanceado (partición lineal); al elegir
   cada corte se prefiere el límite de pasillo (`zoneKey(aisleDepth)`) más cercano dentro de ±10 %
   del peso objetivo, para que dos usuarios no compartan pasillo.
4. Cada bloque es la ruta de un inventariador: los usuarios empiezan en zonas distintas y avanzan
   dentro de su zona.
5. `WorkRebalancer`: cuando alguien termina, recibe la mitad final (`releaseTail`) de la ruta del
   usuario con más pendientes, es decir, el extremo más lejano a la posición actual de este.

`SpatialClusterStrategy` aplica *k-means* con restricción de capacidad sobre coordenadas X/Y y
ordena cada clúster con `NearestNeighborRouteOrdering`.
