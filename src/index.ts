/* eslint-disable max-len */
// Import all needed modules.
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import algoliasearch from "algoliasearch";

// Set up Firestore.
admin.initializeApp();
const db = admin.firestore();

// Set up Algolia.
// The app id and API key are coming from the cloud functions environment, as we set up in Part 1, Step 3.
const algoliaClient = algoliasearch(functions.config().algolia.appid, functions.config().algolia.apikey);
// Since I'm using develop and production environments, I'm automatically defining
// the index name according to which environment is running. functions.config().projectId is a default
// property set by Cloud Functions.
const userIndexName = "user2_dev";
const spotIndexName = "spots_dev";

const userIndex = algoliaClient.initIndex(userIndexName);
const spotIndex = algoliaClient.initIndex(spotIndexName);

// Create a HTTP request cloud function.
export const sendCollectionToAlgolia = functions.https.onRequest(async (req, res) => {
  // This array will contain all records to be indexed in Algolia.
  // A record does not need to necessarily contain all properties of the Firestore document,
  // only the relevant ones.
  // eslint-disable-next-line
  const algoliaRecords: any[] = [];

  // Retrieve all documents from the Thumbnails collection.
  const querySnapshot = await db.collection("Thumbnails").get();

  querySnapshot.docs.forEach((doc) => {
    const document = doc.data();
    // Essentially, you want your records to contain any information that facilitates search,
    // display, filtering, or relevance. Otherwise, you can leave it out.
    const record = {
      objectID: doc.id,
      username: document.username,
      fullName: document.fullName,
      phoneNumber: document.phoneNumber,
      thumbnailURL: document.thumbnailURL,
    };
    algoliaRecords.push(record);
  });

  // After all records are created, we save them
  // eslint-disable-next-line
  userIndex.saveObjects(algoliaRecords, (_error: any, content: any) => {
    res.status(200).send("Thumbnails was indexed to Algolia successfully.");
  });
});

export const collectionOnCreate = functions.firestore.document("Thumbnails/{uid}").onCreate(async (snapshot) => {
  await saveDocumentInAlgolia(snapshot, "user");
});

export const collectionOnUpdate = functions.firestore.document("Thumbnails/{uid}").onUpdate(async (change) => {
  await updateDocumentInAlgolia(change, "user");
});

export const collectionOnDelete = functions.firestore.document("Thumbnails/{uid}").onDelete(async (snapshot) => {
  await deleteDocumentFromAlgolia(snapshot, "user");
});

export const onSpotCreate = functions.firestore.document("/Spots/{zone}/Northing/{northing}/Easting/{easting}/Spots/{spotId}")
    .onCreate(async (snapshot, context) => {
      const spotId = context.params.spotId;
      await saveDocumentInSpotInfo(spotId, snapshot);
      await saveDocumentInAlgolia(snapshot, spotId);
    });

export const onSpotNameUpdate = functions.firestore.document("/Spots/{zone}/Northing/{northing}/Easting/{easting}/Spots/{spotId}")
    .onUpdate(async (change, context) => {
      const spotId = context.params.spotId;
      await saveDocumentInSpotInfo(spotId, change.after);
      await updateDocumentInAlgolia(change, spotId);
    });

export const onSpotDelete = functions.firestore.document("/Spots/{zone}/Northing/{northing}/Easting/{easting}/Spots/{spotId}")
    .onDelete(async (snapshot, context) => {
      const spotId = context.params.spotId;
      await deleteDocumentInSpotInfo(spotId, snapshot);
      await deleteDocumentFromAlgolia(snapshot, "spot");
    });

/**
 * Saves spot information in SpotInfo collection
 * @param {any} spotId spotId to add
 * @param {any} snapshot snapshot for firestore collection
 */
// eslint-disable-next-line
async function saveDocumentInSpotInfo(spotId:any, snapshot: any) {
  if (snapshot.exists) {
    const record = snapshot.data();
    if (record) {
      db.doc("SpotInfo/" + spotId).set(record);
    }
  }
}

/**
 * Deletes spot information in SpotInfo collection
 * @param {any} spotId spotId to delete
 * @param {any} snapshot snapshot for firestore collection
 */
// eslint-disable-next-line
async function deleteDocumentInSpotInfo(spotId:any, snapshot: any) {
  if (snapshot.exists) {
    const record = snapshot.data();
    if (record) {
      db.doc("SpotInfo/" + spotId).delete();
    }
  }
}

/**
 * Saves document in Algolia.
 * @param {any} snapshot snapshot for firestore collection
 * @param {string} type type of document, either "user" or "spot"
 */
// eslint-disable-next-line
async function saveDocumentInAlgolia(snapshot: any, type: string) {
  if (snapshot.exists) {
    const record = snapshot.data();
    if (record) { // Removes the possibility of snapshot.data() being undefined.
      record.objectID = snapshot.id;
      if (type == "user") {
        // Adds uesr to user index in Algolia
        await userIndex.saveObject(record);
      } else {
        await spotIndex.saveObject(record);
      }
    }
  }
}

/**
 * updates Algolia document
 * @param {any} change update to take place
 * @param {string} type either "user" or "spot"
 */
async function updateDocumentInAlgolia(change: functions.Change<FirebaseFirestore.DocumentSnapshot>, type: string) {
  await saveDocumentInAlgolia(change.after, type);
}

/**
 * deletes a document in Algolia
 * @param {any} snapshot snapshot for firestore collection to delete from
 * @param {string} type either a "user" or "spot"
 */
async function deleteDocumentFromAlgolia(snapshot: FirebaseFirestore.DocumentSnapshot, type: string) {
  if (snapshot.exists) {
    const objectID = snapshot.id;
    if (type == "user") {
      await userIndex.deleteObject(objectID);
    } else {
      await spotIndex.deleteObject(objectID);
    }
  }
}
