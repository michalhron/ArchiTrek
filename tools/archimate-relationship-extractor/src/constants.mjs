/** OWL / RDF URIs used when parsing Turtle. */
export const NS = {
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#",
};

export const RDF_TYPE = NS.rdf + "type";
export const RDFS_LABEL = NS.rdfs + "label";
export const RDFS_SUBCLASS_OF = NS.rdfs + "subClassOf";
export const RDFS_SUBPROPERTY_OF = NS.rdfs + "subPropertyOf";
export const OWL_CLASS = NS.owl + "Class";
export const OWL_OBJECT_PROPERTY = NS.owl + "ObjectProperty";
export const OWL_TRANSITIVE_PROPERTY = NS.owl + "TransitiveProperty";

/** ArchiMate relationship property local names (ontology <#...>). */
export const RELATION_PROPERTY_NAMES = [
  "assignment",
  "aggregation",
  "composition",
  "realization",
  "serving",
  "access",
  "influence",
  "association",
  "triggering",
  "flow",
  "specialization",
];

export const PROPERTY_TO_RELATION_CLASS = {
  structuralRelationship: "Structural",
  dependencyRelationship: "Dependency",
  dynamicRelationship: "Dynamic",
  otherRelationship: "Other",
};

/** Archi / exchange XML `xsi:type` suffix → relation_type */
export const ARCHI_RELATIONSHIP_TYPE = {
  AssignmentRelationship: "assignment",
  AggregationRelationship: "aggregation",
  CompositionRelationship: "composition",
  RealizationRelationship: "realization",
  ServingRelationship: "serving",
  AccessRelationship: "access",
  InfluenceRelationship: "influence",
  AssociationRelationship: "association",
  TriggeringRelationship: "triggering",
  FlowRelationship: "flow",
  SpecializationRelationship: "specialization",
};

/** folder `type` on Archi `<folder>` → layer label */
export const ARCHI_FOLDER_TYPE_TO_LAYER = {
  strategy: "Strategy",
  business: "Business",
  application: "Application",
  technology: "Technology",
  motivation: "Motivation",
  implementation: "Implementation & Migration",
  relations: "Relations",
  other: "Other",
};

export const EXCLUDE_ELEMENT_CLASSES = new Set([
  "Element",
  "CompositeElement",
  "GenericComposite",
  "LayerComposite",
  "Concept",
  "Model",
  "Relationship",
  "RelationshipConnector",
  "ArchiMate",
  "ArchiMateView",
  "ArchiMateViewpoint",
]);
