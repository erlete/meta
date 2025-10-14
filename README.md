# Meta

This directory contains all functionalities related to the repository itself, such as internal generation of files and configurations, propagation of said configurations to prevent overall redundancy, etc.

## Configuration

Meta configuration defines the standard in configuration (schemas, templates, examples) for other utilities.

e.g.: configuring .gitignore.meta.json as mirror for .gitignore

All configuration files must be placed in the same directory as their corresponding mirror (the file they are meant to configure), and have the same name, including extension, followed by the `.meta.json` extensions. This allows for quick and direct linking between files.

## Generation

Meta generation refers to the processes followed in order to generate data from a configuration.

e.g.: generating .gitignore file from .gitignore.meta.json

## Propagation

Meta propagation refers to the processes followed in order to populate data from a source in the expected targets.

e.g.: given an original .env file, the .env.meta.json determines how and where the values in the original file will be propagated.
