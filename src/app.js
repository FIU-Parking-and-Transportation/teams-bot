import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import { CronJob } from "cron";

const OCCUPANCY_WEBHOOK = process.env.OCCUPANCY_WEBHOOK;
const OCCUPANCY_XML = process.env.OCCUPANCY_XML;

function createMessage() {
  const date = new Date();

  const dateTimeInTZ = date.toLocaleString("en-US", {
    timeZone: "America/New_York",
  });

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          version: "1.5",
          $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
          body: [
            {
              type: "TextBlock",
              text: "Available Student Spaces MMC for " + dateTimeInTZ,
            },
            {
              type: "Table",
              columns: [{ width: 2 }, { width: 2 }],
              rows: [
                {
                  type: "TableRow",
                  cells: [
                    {
                      type: "TableCell",
                      items: [
                        {
                          type: "TextBlock",
                          text: "Location",
                          wrap: true,
                        },
                      ],
                    },
                    {
                      type: "TableCell",
                      items: [
                        {
                          type: "TextBlock",
                          wrap: true,
                        },
                        {
                          type: "TextBlock",
                          text: "Available Spaces",
                          wrap: true,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  };
}
function addTableRow(message, locationText, availableSpacesText) {
  // Navigate into the Adaptive Card body to find the Table element
  const card = message.attachments[0].content;
  const table = card.body.find((item) => item.type === "Table");

  if (!table) {
    console.error("Table not found in Adaptive Card.");
    return;
  }

  // Construct a new table row
  const newRow = {
    type: "TableRow",
    cells: [
      {
        type: "TableCell",
        items: [
          {
            type: "TextBlock",
            text: locationText,
            wrap: true,
          },
        ],
      },
      {
        type: "TableCell",
        items: [
          {
            type: "TextBlock",
            text: availableSpacesText,
            wrap: true,
          },
        ],
      },
    ],
  };

  // Add the row to the table
  table.rows.push(newRow);
}

function parseXML(xmlUrl) {
  return fetch(xmlUrl)
    .then((response) => {
      if (!response.ok) {
        return response
          .text()
          .then((body) =>
            Promise.reject(
              new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`),
            ),
          );
      }
      return response.text();
    })
    .then((xmlText) => parseStringPromise(xmlText))
    .then((json) => {
      const items =
        json?.OccupancyExport?.ParkingOccupancies?.[0]?.Occupancy ?? [];

      return items.map((o) => ({
        zoneName: o.ParkingZoneName?.[0] ?? "",
        capacity: Number(o.Capacity?.[0] ?? 0),
        vehicles: Number(o.Vehicles?.[0] ?? 0),
      }));
    });
}

function hydrateTable(payload, data) {
  data.forEach((zone) => {
    addTableRow(
      payload,
      zone.zoneName,
      Math.max(0, zone.capacity - zone.vehicles) == 0
        ? "Full"
        : zone.capacity - zone.vehicles,
    );
  });
  return payload;
}

function postTable(payload) {
  fetch(OCCUPANCY_WEBHOOK, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function postOccupancyMessage() {
  parseXML(OCCUPANCY_XML)
    .then((list) =>
      hydrateTable(
        createMessage(),
        list.sort((a, b) =>
          a.zoneName.localeCompare(b.zoneName, undefined, { numeric: true }),
        ),
      ),
    )
    .then((payload) => postTable(payload))
    .catch((err) => console.error("Failed: ", err.message));

  const date = new Date();

  const dateTimeInTZ = date.toLocaleString("en-US", {
    timeZone: "America/New_York",
  });

  console.log("Request sent " + dateTimeInTZ + "!");
}

const job = CronJob.from({
  cronTime: "0 */5 * * * *",
  onTick: function () {
    postOccupancyMessage();
  },
  start: false,
  timeZone: "America/New_York",
});
job.start();
