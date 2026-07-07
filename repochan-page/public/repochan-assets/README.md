# RepoChan Generated Assets

Copy delivered image results from `.repochan/orders/<orderId>/versions/<versionId>/`
into this directory using stable paths such as:

```text
public/repochan-assets/<orderId>/<versionId>/<file>
```

Then update `src/config/assets.ts` with `status: "ready"`, `versionId`, `file`,
and `src: "/repochan-assets/<orderId>/<versionId>/<file>"`.
