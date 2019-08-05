import { promises } from "fs";
import hummus from "hummus";
import { resolve } from "path";
import prompts from "prompts";
import yargs from "yargs";

/**
 * Reads all invoices in categorised folders and generates combined statements, sorted by modification date
 *
 * Expects a folder structure like $ROOT_DIR/$CATEGORIES/*.(pdf|jpe?g|png)
 * e.g. ~/invoices/incoming/invoice-1.pdf
 */

const args = yargs.parse(process.argv.slice(2));
const ROOT_DIR = args._[0];
const USER_NAME = args.name;
const FILE_PREFIX = "rechnungen";
const CATEGORIES = {
  incoming: "eingehend",
  outgoing: "ausgehend"
};
const MONTHS = {
  january: "januar",
  february: "februar",
  march: "märz",
  april: "april",
  may: "mai",
  june: "juni",
  july: "juli",
  august: "august",
  september: "september",
  october: "oktober",
  november: "november",
  december: "dezember"
};

const OUTPUT_FILE_FORMATTER = ({
  category,
  month
}: {
  category: string;
  month: string;
}) =>
  USER_NAME
    ? `${FILE_PREFIX}_${category}_${USER_NAME}_${month}.pdf`
    : `${FILE_PREFIX}_${category}_${month}.pdf`;

(async () => {
  if (!ROOT_DIR) {
    console.error(`Please provide a root directory.`);
    process.exit(1);
  }

  try {
    await promises.access(ROOT_DIR);
  } catch (e) {
    console.error(`Couldn't access ${ROOT_DIR}. Does it exist?`);
    process.exit(1);
  }

  const choices = Object.keys(MONTHS).map(month => ({
    title: month,
    value: month
  }));

  const response = await prompts({
    type: "autocomplete",
    name: "month",
    message: "What month?",
    choices
  });

  const { month }: { month: keyof typeof MONTHS } = response;

  const monthDir = resolve(ROOT_DIR, month);

  try {
    await promises.access(ROOT_DIR);
    await promises.access(monthDir);
  } catch (e) {
    console.error(`Couldn't access ${month}. Does it exist?`);
    process.exit(1);
  }

  Object.entries(CATEGORIES).forEach(async ([category, categoryOutputName]) => {
    const categoryDir = resolve(monthDir, category);

    try {
      await promises.access(categoryDir);
    } catch (e) {
      console.error(`Couldn't access ${month}/${category}. Does it exist?`);
    }

    const fileNames = (await promises.readdir(categoryDir)).filter(
      fileName => !!fileName.match(/\.(pdf|jpe?g|png)$/)
    );

    // Read file stats
    const files = await Promise.all(
      fileNames.map(async fileName => {
        const stat = await promises.stat(resolve(categoryDir, fileName));
        return {
          stat,
          name: fileName
        };
      })
    );

    // Sort by modified date
    const sortedFiles = files.sort(
      (a, b) => a.stat.mtime.getTime() - b.stat.mtime.getTime()
    );

    const outputFilepath = resolve(
      monthDir,
      OUTPUT_FILE_FORMATTER({
        category: categoryOutputName,
        month: MONTHS[month]
      })
    );

    const pdfWriter = hummus.createWriter(outputFilepath);

    sortedFiles.forEach(file => {
      const filePath = resolve(categoryDir, file.name);

      if (file.name.endsWith(".pdf")) {
        pdfWriter.appendPDFPagesFromPDF(resolve(categoryDir, file.name));
      } else if (
        file.name.endsWith(".jpg") ||
        file.name.endsWith(".jpeg") ||
        file.name.endsWith(".png")
      ) {
        const page = pdfWriter.createPage(0, 0, 595, 842);
        const pageContext = pdfWriter.startPageContentContext(page);

        pageContext.drawImage(0, 0, filePath, {
          transformation: {
            width: 595,
            height: 842,
            proportional: true,
            fit: "always"
          }
        });

        pdfWriter.writePage(page);
      } else {
        console.warn("Unsupported file:", file.name);
        return;
      }
    });

    console.log("Created", outputFilepath);

    pdfWriter.end();
  });
})();
