const { writeFileSync, ensureDir, copy } = require("fs-extra");
const { join, dirname } = require("path");
const { execSync } = require("child_process");
const { default: fetch } = require("node-fetch-cjs");
const lastVersionFile = require("./lastVersion.json");

async function getAllElectronVersions(lastVersion) {
  const response = await fetch("https://registry.npmjs.org/electron");
  const data = await response.json();
  return Object.keys(data.versions)
    .filter((version) => {
      const [majorLast, minorLast, patchLast] = lastVersion
        .split(".")
        .map(Number);
      const [major, minor, patch] = version.split(".").map(Number);
      if (major > majorLast) return true;
      if (major === majorLast && minor > minorLast) return true;
      if (major === majorLast && minor === minorLast && patch > patchLast)
        return true;
      return false;
    })
    .sort((a, b) => {
      const [majorA, minorA, patchA] = a.split(".").map(Number);
      const [majorB, minorB, patchB] = b.split(".").map(Number);
      return majorA - majorB || minorA - minorB || patchA - patchB;
    });
}

function getNpmTag(version) {
  if (version.includes("alpha")) {
    return "alpha";
  } else if (version.includes("beta")) {
    return "beta";
  } else {
    return "latest";
  }
}

async function extractAndPublish(version) {
  try {
    const lastVersion = lastVersionFile.lastVersion;

    if (lastVersion === version) {
      console.log(`Version ${version} is already published. Skipping.`);
      return;
    }

    // Update package.json with the new Electron version
    const packageJsonPath = join(__dirname, "package.json");
    const packageJson = require(packageJsonPath);
    packageJson.devDependencies.electron = version;
    packageJson.version = version.replace("^", ""); // Ensure versioning aligns with Electron version
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    // Install the specific version of Electron
    execSync("npm install", { stdio: "inherit" });

    // Extract the typings
    const electronPath = dirname(require.resolve("electron/package.json"));
    const typingsPath = join(electronPath, "electron.d.ts");
    const destinationPath = join(__dirname, "electron.d.ts");
    await ensureDir(dirname(destinationPath));
    await copy(typingsPath, destinationPath);
    console.log("Typings extracted successfully!");

    const npmTag = getNpmTag(version);

    // Publish the package
    execSync(`npm publish --access public --tag ${npmTag}`, {
      stdio: "inherit",
    });
    console.log("Package published successfully!");

    // Update last published version
    writeFileSync(
      lastVersionPath,
      JSON.stringify({ lastVersion: version }, null, 2)
    );
  } catch (error) {
    console.error("Error during extraction and publishing:", error);
  }
}

async function main() {
  const lastVersion = lastVersionFile.lastVersion;
  const versions = await getAllElectronVersions(lastVersion);

  for (const version of versions) {
    if (version > lastVersion) {
      console.log(`Processing Electron version ${version}`);
      await extractAndPublish(version);
    }
  }
}

main().catch(console.error);
