# LLM Discord Bot

Discord上でLLMへ問い合わせをすることができるBotです。

## Bot設定

### OAuth2 Invite Link
https://discord.com/oauth2/authorize?client_id=1301863084914114560&permissions=2147485696&integration_type=0&scope=bot+applications.commands

## 画像入力

`/llm` コマンドの `image` ～ `image4` オプション、またはBotへのリプライに画像を添付すると、
画像つきで問い合わせできます。対応形式はJPEG / PNG / GIF / WebP、1枚あたり5MBまで、1メッセージ4枚までです。

### S3バケット

Discordの添付ファイルURLは約24時間で失効するため、画像の実体はS3に保存します。
バケットは `us-west-2` の `llm-discord-bot-images` を作成済みで、環境変数 `IMAGE_BUCKET_NAME` で指定します。
`images/` プレフィックスに30日で削除するライフサイクルルールを設定してあります。

別環境にバケットを作り直す場合は以下の通りです。

``` sh
export IMAGE_BUCKET_NAME=llm-discord-bot-images

aws s3api create-bucket \
  --bucket "$IMAGE_BUCKET_NAME" \
  --region us-west-2 \
  --create-bucket-configuration LocationConstraint=us-west-2

aws s3api put-bucket-lifecycle-configuration \
  --bucket "$IMAGE_BUCKET_NAME" \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "expire-discord-images",
        "Status": "Enabled",
        "Filter": { "Prefix": "images/" },
        "Expiration": { "Days": 30 },
        "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
      }
    ]
  }'

aws s3api put-bucket-tagging \
  --bucket "$IMAGE_BUCKET_NAME" \
  --tagging 'TagSet=[{Key=Project,Value=llm-discord-bot}]'
```

期限切れの画像を含む会話を継続した場合、その画像は「保存期限が切れているため参照できません」という
テキストに置き換わり、会話自体は継続できます。

## 画像生成

「〜の画像を作って」のように頼むと、Bot が OpenAI `gpt-image-2` で画像を生成して添付します。
添付した画像や直前に生成した画像を指して「これをこう変えて」と頼めば編集もできます。

生成した画像も入力画像と同じ S3 バケットに保存されるため、30日で削除されます。

## ローカル実行

``` sh
npm run build
npm run start
```