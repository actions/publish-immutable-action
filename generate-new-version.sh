#!/bin/bash

VERSION=$1
MESSAGE=$2

if [ -z "$VERSION" ]
then
  echo "No version supplied"
  exit 1
fi

if [ -z "$MESSAGE" ]
then
  echo "No message supplied"
  exit 1
fi

echo "Generating new version $VERSION with message $MESSAGE"

sed -i '' -E 's/ddivad195\/publish-action-package\/package-and-publish.*$/ddivad195\/publish-action-package\/package-and-publish@v'$VERSION'/g' action.yml
npm run bundle
git add .
git commit -m "$VERSION: $MESSAGE"
git push
gh release create --repo ddivad195/publish-action-package --title $VERSION --notes $VERSION $VERSION